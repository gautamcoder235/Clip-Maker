use crate::config::model::{EffectState, KeyframePoint};

pub struct EffectsMapper;

impl EffectsMapper {
    /// Compiles a set of keyframe points into a single nested FFmpeg math expression string
    pub fn compile_parameter_expression(
        points: &[KeyframePoint],
        clip_start_time: f64,
        default_val: f64,
        scale_factor: f64,
    ) -> String {
        if points.is_empty() {
            return format!("{:.4}", default_val * scale_factor);
        }

        // Sort points by timestamp
        let mut sorted_points = points.to_vec();
        sorted_points.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap());

        // Extract and map times relative to output playhead (T = time - clip_start_time)
        let mut relative_points = Vec::new();
        for pt in &sorted_points {
            let val = pt.value.as_f64().unwrap_or(default_val) * scale_factor;
            relative_points.push((pt.time - clip_start_time, val, pt.easing.to_lowercase()));
        }

        // 1. Single keyframe point -> constant value
        if relative_points.len() == 1 {
            return format!("{:.4}", relative_points[0].1);
        }

        // 2. Build recursive nested ternary if(lt(t, t_next), INTERPOLATION_PASS, ELSE_PASS)
        Self::build_ternary_expression(&relative_points, 0)
    }

    fn build_ternary_expression(points: &[(f64, f64, String)], index: usize) -> String {
        let len = points.len();
        
        // Safety bounds checks
        if index >= len {
            return "0.0".to_string();
        }
        if index == len - 1 {
            return format!("{:.4}", points[index].1);
        }

        let (t_curr, v_curr, easing) = &points[index];
        let (t_next, v_next, _) = &points[index + 1];
        let duration = t_next - t_curr;

        // Prevent division by zero
        let duration_safe = if duration.abs() < 1e-5 { 1e-5 } else { duration };

        // Normalized progress ratio: R = (t - t_curr) / duration
        let ratio_expr = format!("((t-({:.4}))/{:.4})", t_curr, duration_safe);

        // Interpolation formulas inside FFmpeg
        let interp_expr = match easing.as_str() {
            "step" => format!("{:.4}", v_curr),
            "ease-in" => {
                // v_curr + (v_next - v_curr) * R^2
                format!(
                    "({:.4}+({:.4})*pow({},2))",
                    v_curr,
                    v_next - v_curr,
                    ratio_expr
                )
            }
            "ease-out" => {
                // v_curr + (v_next - v_curr) * R * (2.0 - R)
                format!(
                    "({:.4}+({:.4})*({}*(2.0-{})))",
                    v_curr,
                    v_next - v_curr,
                    ratio_expr,
                    ratio_expr
                )
            }
            "ease-in-out" => {
                // Smoothstep: v_curr + (v_next - v_curr) * R^2 * (3.0 - 2.0 * R)
                format!(
                    "({:.4}+({:.4})*(pow({},2)*(3.0-2.0*{})))",
                    v_curr,
                    v_next - v_curr,
                    ratio_expr,
                    ratio_expr
                )
            }
            "linear" | _ => {
                // v_curr + (v_next - v_curr) * R
                format!(
                    "({:.4}+({:.4})*{})",
                    v_curr,
                    v_next - v_curr,
                    ratio_expr
                )
            }
        };

        // Recursive composition: if t < t_next, evaluate current segment, else evaluate remaining segments
        format!(
            "if(lt(t,{:.4}),{},{})",
            t_next,
            interp_expr,
            Self::build_ternary_expression(points, index + 1)
        )
    }

    /// Translates the complete effects stack on a clip into a list of FFmpeg video filter graphs
    pub fn map_effects_to_filters(effects: &[EffectState], clip_start_time: f64) -> Vec<String> {
        let mut filters = Vec::new();

        // 1. Brightness & Contrast
        let brightness_opt = effects.iter().find(|e| e.effect_id == "brightness-contrast");
        if let Some(effect) = brightness_opt {
            if effect.enabled {
                let brightness_points = effect.parameters.get("brightness")
                    .map(|p| p.points.clone())
                    .unwrap_or_default();
                let contrast_points = effect.parameters.get("contrast")
                    .map(|p| p.points.clone())
                    .unwrap_or_default();

                // Brightness maps from [-100, 100] in JS slider to [-1.0, 1.0] in FFmpeg eq
                let brightness_expr = Self::compile_parameter_expression(&brightness_points, clip_start_time, 0.0, 0.01);
                // Contrast maps from [0.0, 10.0] in JS slider to [0.0, 10.0] in FFmpeg eq
                let contrast_expr = Self::compile_parameter_expression(&contrast_points, clip_start_time, 1.0, 1.0);

                filters.push(format!("eq=brightness='{}':contrast='{}'", brightness_expr, contrast_expr));
            }
        }

        // 2. Saturation
        let saturation_opt = effects.iter().find(|e| e.effect_id == "saturation");
        if let Some(effect) = saturation_opt {
            if effect.enabled {
                let saturation_points = effect.parameters.get("saturation")
                    .map(|p| p.points.clone())
                    .unwrap_or_default();

                // Saturation maps from [0, 200] in JS to [0.0, 2.0] in FFmpeg eq
                let saturation_expr = Self::compile_parameter_expression(&saturation_points, clip_start_time, 100.0, 0.01);
                filters.push(format!("eq=saturation='{}'", saturation_expr));
            }
        }

        // 3. Box Blur
        let blur_opt = effects.iter().find(|e| e.effect_id == "box-blur");
        if let Some(effect) = blur_opt {
            if effect.enabled {
                let radius_points = effect.parameters.get("radius")
                    .map(|p| p.points.clone())
                    .unwrap_or_default();
                let passes_points = effect.parameters.get("passes")
                    .map(|p| p.points.clone())
                    .unwrap_or_default();

                let radius_expr = Self::compile_parameter_expression(&radius_points, clip_start_time, 0.0, 1.0);
                let passes_expr = Self::compile_parameter_expression(&passes_points, clip_start_time, 1.0, 1.0);

                filters.push(format!("boxblur=luma_radius='{}':luma_power='{}'", radius_expr, passes_expr));
            }
        }

        // 4. Opacity / Transparency
        let opacity_opt = effects.iter().find(|e| e.effect_id == "opacity");
        if let Some(effect) = opacity_opt {
            if effect.enabled {
                let opacity_points = effect.parameters.get("opacity")
                    .map(|p| p.points.clone())
                    .unwrap_or_default();

                // Opacity maps from [0, 100] in JS to [0.0, 1.0] in FFmpeg
                let opacity_expr = Self::compile_parameter_expression(&opacity_points, clip_start_time, 100.0, 0.01);
                filters.push("format=rgba".to_string());
                filters.push(format!("colorchannelmixer=aa='{}'", opacity_expr));
            }
        }

        filters
    }
}
