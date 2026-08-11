use crate::ffmpeg::crop::CropFilter;
use crate::ffmpeg::filters::{ScaleFilter, CanvasPlacementFilter};
use crate::ffmpeg::overlay::{TextOverlayFilter, MediaOverlaySpec, OverlayStep};
use crate::ffmpeg::encoder::EncoderDetector;

pub struct FFmpegBuilder {
    inputs: Vec<String>,
    video_filters: Vec<String>,
    overlays: Vec<OverlayStep>,
    output_path: String,
    
    // Canvas placement background
    background_canvas: Option<(u32, u32)>,
    overlay_position: Option<(i32, i32)>,
    crop_offset: (i32, i32),
    overlay_size: Option<(u32, u32)>,
    background_color: Option<String>,
    background_image_path: Option<String>,
    background_image_position: Option<(i32, i32)>,
    background_image_size: Option<(u32, u32)>,

    // Media overlays extra inputs
    extra_inputs: Vec<String>,
    extra_inputs_added: bool,

    // Seek/Duration parameters
    start_time: Option<f64>,
    duration: Option<f64>,
    fast_seek: bool,
    seek_margin: f64,
    output_seek_offset: f64,

    // Output settings
    fps: Option<f64>,
    gpu_acceleration: bool,
    gpu_encoder: Option<String>,
    include_audio: bool,
    audio_codec: String,
    preset: String,
    crf: u32,
}

impl FFmpegBuilder {
    pub fn new(_ffmpeg_path: &str) -> Self {
        FFmpegBuilder {
            inputs: Vec::new(),
            video_filters: Vec::new(),
            overlays: Vec::new(),
            output_path: String::new(),
            background_canvas: None,
            overlay_position: None,
            crop_offset: (0, 0),
            overlay_size: None,
            background_color: None,
            background_image_path: None,
            background_image_position: None,
            background_image_size: None,
            extra_inputs: Vec::new(),
            extra_inputs_added: false,
            start_time: None,
            duration: None,
            fast_seek: false,
            seek_margin: 0.0,
            output_seek_offset: 0.0,
            fps: None,
            gpu_acceleration: false,
            gpu_encoder: None,
            include_audio: true,
            audio_codec: "copy".to_string(),
            preset: "fast".to_string(),
            crf: 22,
        }
    }

    pub fn input(&mut self, path: &str) -> &mut Self {
        self.inputs.push(path.to_string());
        self
    }

    pub fn split(&mut self, start_time: f64, duration: f64, fast_seek: bool, seek_margin: f64) -> &mut Self {
        self.start_time = Some(start_time);
        self.duration = Some(duration);
        self.fast_seek = fast_seek;
        self.seek_margin = seek_margin;
        self
    }

    pub fn set_fps(&mut self, fps: f64) -> &mut Self {
        if fps > 0.0 {
            self.fps = Some(fps);
        }
        self
    }

    pub fn crop(&mut self, aspect_ratio: &str, anchor: &str) -> &mut Self {
        let filter = CropFilter::new(aspect_ratio, anchor);
        if let Some(f_str) = filter.to_filter_string() {
            self.video_filters.push(f_str);
        }
        self
    }

    pub fn scale_to(&mut self, width: u32, height: u32, keep_aspect: bool) -> &mut Self {
        let filter = ScaleFilter::new(width, height, keep_aspect);
        self.video_filters.extend(filter.to_filter_strings());
        self
    }

    pub fn place_on_canvas(
        &mut self,
        canvas_width: u32,
        canvas_height: u32,
        video_width: u32,
        video_height: u32,
        x: i32,
        y: i32,
        background_color: &str,
        background_image: Option<&str>,
        bg_image_x: i32,
        bg_image_y: i32,
        bg_image_w: u32,
        bg_image_h: u32,
        crop_left: f64,
        crop_top: f64,
    ) -> &mut Self {
        let filter = CanvasPlacementFilter::new(canvas_width, canvas_height, video_width, video_height, x, y);
        self.video_filters.push(filter.to_scale_filter());
        self.background_canvas = Some((canvas_width, canvas_height));
        self.overlay_position = Some((x, y));
        self.crop_offset = (crop_left.round() as i32, crop_top.round() as i32);
        self.overlay_size = Some((video_width, video_height));
        self.background_color = Some(background_color.to_string());
        
        if let Some(bg_img) = background_image {
            if !bg_img.is_empty() {
                self.background_image_path = Some(bg_img.to_string());
                if bg_image_w > 0 && bg_image_h > 0 {
                    self.background_image_size = Some((bg_image_w, bg_image_h));
                }
                self.background_image_position = Some((bg_image_x, bg_image_y));
            }
        }
        self
    }

    pub fn add_video_filter(&mut self, filter: &str) -> &mut Self {
        self.video_filters.push(filter.to_string());
        self
    }

    pub fn add_media_overlay(&mut self, spec: MediaOverlaySpec) -> &mut Self {
        self.overlays.push(OverlayStep::Media(spec));
        self
    }

    pub fn overlay_text(
        &mut self,
        text: &str,
        font_size: u32,
        font_color: &str,
        font_file: Option<&str>,
        x: &str,
        y: &str,
        outline: bool,
        letter_spacing: i32,
        font_weight: u32,
    ) -> &mut Self {
        self.overlays.push(OverlayStep::Text {
            text: text.to_string(),
            font_size,
            font_color: font_color.to_string(),
            font_file: font_file.map(|s| s.to_string()),
            x: x.to_string(),
            y: y.to_string(),
            outline,
            letter_spacing,
            font_weight,
        });
        self
    }


    pub fn encode(
        &mut self,
        output_path: &str,
        gpu_acceleration: bool,
        gpu_encoder: Option<&str>,
        include_audio: bool,
        preset: &str,
        crf: u32,
    ) -> &mut Self {
        self.output_path = output_path.to_string();
        self.gpu_acceleration = gpu_acceleration;
        self.gpu_encoder = gpu_encoder.map(|s| s.to_string());
        self.include_audio = include_audio;
        self.preset = preset.to_string();
        self.crf = crf;
        self
    }

    pub fn set_audio_codec(&mut self, codec: &str) -> &mut Self {
        if !codec.is_empty() {
            self.audio_codec = codec.to_string();
        }
        self
    }

    pub fn build(&mut self) -> Vec<String> {
        // Apply FPS if set (must be done before filter graph construction)
        if let Some(rate) = self.fps {
            let fps_str = format!("fps={}", rate);
            if !self.video_filters.contains(&fps_str) {
                self.video_filters.push(fps_str);
            }
        }

        // 1. Filter Graph Construction (called first to populate self.extra_inputs)
        let has_canvas = self.background_canvas.is_some() && self.overlay_position.is_some();
        let filter_args = if has_canvas || !self.overlays.is_empty() {
            self.build_complex_filter()
        } else {
            self.build_simple_filter()
        };

        let mut cmd = Vec::new();

        // 2. Seek / Inputs setup
        let mut ss_args = Vec::new();
        let mut output_ss_args = Vec::new();
        self.output_seek_offset = 0.0;

        if let Some(start) = self.start_time {
            if self.fast_seek {
                let margin = self.seek_margin.max(0.0);
                if margin > 0.0 && start > margin {
                    let input_seek = start - margin;
                    ss_args.push("-ss".to_string());
                    ss_args.push(input_seek.to_string());
                    
                    output_ss_args.push("-ss".to_string());
                    output_ss_args.push(margin.to_string());
                    self.output_seek_offset = margin;
                } else {
                    // start <= margin: input seek to 0.0, output seek to start
                    ss_args.push("-ss".to_string());
                    ss_args.push("0.0".to_string());
                    
                    output_ss_args.push("-ss".to_string());
                    output_ss_args.push(start.to_string());
                    self.output_seek_offset = start;
                }
            } else {
                // For accurate slow seek, it must come AFTER -i, i.e., in output_ss_args
                output_ss_args.push("-ss".to_string());
                output_ss_args.push(start.to_string());
            }
        }

        // Add overwrite and logs flags
        cmd.push("-y".to_string());
        cmd.push("-hide_banner".to_string());
        cmd.push("-nostdin".to_string());
        cmd.push("-loglevel".to_string());
        cmd.push("error".to_string()); // Change from warning to error to prevent swscaler/font warnings from flooding IPC
        cmd.push("-stats".to_string());
        cmd.push("-threads".to_string());
        cmd.push("0".to_string());


        // Fast seek input flags must come BEFORE -i
        if !ss_args.is_empty() {
            cmd.extend(ss_args);
        }

        if let Some(first_input) = self.inputs.first() {
            cmd.push("-i".to_string());
            cmd.push(first_input.clone());
        }

        // Inject extra inputs (bg images, media overlays) that were populated in build_complex_filter
        if !self.extra_inputs.is_empty() {
            cmd.extend(self.extra_inputs.clone());
        }

        // Output seeks (for accurate hybrid/slow seek cut offsets)
        if !output_ss_args.is_empty() {
            cmd.extend(output_ss_args);
        }

        if let Some(dur) = self.duration {
            cmd.push("-t".to_string());
            cmd.push(dur.to_string());
        }

        // Add the filter args
        cmd.extend(filter_args);

        // 3. Encoder details
        if self.gpu_acceleration && self.gpu_encoder.is_some() {
            let encoder = self.gpu_encoder.clone().unwrap();
            cmd.push("-c:v".to_string());
            cmd.push(encoder.clone());

            let preset_mapped = EncoderDetector::map_preset(&encoder, &self.preset);
            if encoder.contains("nvenc") {
                cmd.push("-preset".to_string());
                cmd.push(preset_mapped);
                cmd.push("-cq".to_string());
                cmd.push(self.crf.clamp(0, 51).to_string());
            } else if encoder.contains("qsv") {
                cmd.push("-global_quality".to_string());
                cmd.push(self.crf.clamp(1, 51).to_string());
            } else if encoder.contains("amf") {
                cmd.push("-quality".to_string());
                cmd.push(preset_mapped);
            }
        } else {
            cmd.push("-c:v".to_string());
            cmd.push("libx264".to_string());
            cmd.push("-preset".to_string());
            cmd.push(self.preset.clone());
            cmd.push("-crf".to_string());
            cmd.push(self.crf.to_string());
        }

        match self.audio_codec.to_lowercase().as_str() {
            "none" | "mute" | "disabled" => {
                cmd.push("-an".to_string());
            }
            "aac" => {
                cmd.push("-c:a".to_string());
                cmd.push("aac".to_string());
                cmd.push("-b:a".to_string());
                cmd.push("192k".to_string());
            }
            "mp3" | "libmp3lame" => {
                cmd.push("-c:a".to_string());
                cmd.push("libmp3lame".to_string());
                cmd.push("-b:a".to_string());
                cmd.push("192k".to_string());
            }
            "opus" | "libopus" => {
                cmd.push("-c:a".to_string());
                cmd.push("libopus".to_string());
                cmd.push("-b:a".to_string());
                cmd.push("160k".to_string());
            }
            "ac3" => {
                cmd.push("-c:a".to_string());
                cmd.push("ac3".to_string());
                cmd.push("-b:a".to_string());
                cmd.push("384k".to_string());
            }
            "flac" => {
                cmd.push("-c:a".to_string());
                cmd.push("flac".to_string());
            }
            "pcm_s16le" | "wav" | "pcm" => {
                cmd.push("-c:a".to_string());
                cmd.push("pcm_s16le".to_string());
            }
            _ => {
                if self.include_audio {
                    cmd.push("-c:a".to_string());
                    cmd.push("copy".to_string());
                } else {
                    cmd.push("-an".to_string());
                }
            }
        }

        cmd.push(self.output_path.clone());
        cmd
    }

    fn build_simple_filter(&self) -> Vec<String> {
        let combined = self.video_filters.clone();

        if !combined.is_empty() {
            vec!["-vf".to_string(), combined.join(",")]
        } else {
            Vec::new()
        }
    }

    fn build_complex_filter(&mut self) -> Vec<String> {
        let mut chains = Vec::new();
        let mut extra_inputs = Vec::new();
        let mut input_index = 1;
        let mut base_label = "fg".to_string();

        let pre_chain = self.video_filters.join(",");
        let fg_chain = if !pre_chain.is_empty() {
            format!("[0:v]{}[fg]", pre_chain)
        } else {
            "[0:v]setpts=PTS-STARTPTS[fg]".to_string()
        };
        chains.push(fg_chain);

        if let Some((canvas_w, canvas_h)) = self.background_canvas {
            let (x_pos, y_pos) = self.overlay_position.unwrap();
            let bg_color = self.background_color.clone().unwrap_or_else(|| "black".to_string());
            let normalized_color = Self::normalize_color(&bg_color);

            if let Some(ref bg_image_path) = self.background_image_path {
                let bg_input_index = input_index;
                input_index += 1;
                
                extra_inputs.push("-loop".to_string());
                extra_inputs.push("1".to_string());
                extra_inputs.push("-i".to_string());
                extra_inputs.push(bg_image_path.clone());

                if let Some((bg_w, bg_h)) = self.background_image_size {
                    let (bg_x, bg_y) = self.background_image_position.unwrap_or((0, 0));
                    let bg_base = format!("color=c={}:s={}x{}[bgbase]", normalized_color, canvas_w, canvas_h);
                    let bg_img = format!("[{}:v]scale={}:{},setpts=PTS-STARTPTS[bgimg]", bg_input_index, bg_w, bg_h);
                    let bg_comp = format!("[bgbase][bgimg]overlay={}:{}:format=auto[bg]", bg_x, bg_y);
                    chains.push(bg_base);
                    chains.push(bg_img);
                    chains.push(bg_comp);
                } else {
                    let bg_chain = format!(
                        "[{}:v]scale=w={}:h={}:force_original_aspect_ratio=increase,crop={}:{},setpts=PTS-STARTPTS[bg]",
                        bg_input_index, canvas_w, canvas_h, canvas_w, canvas_h
                    );
                    chains.push(bg_chain);
                }
            } else {
                let bg_chain = format!("color=c={}:s={}x{}[bg]", normalized_color, canvas_w, canvas_h);
                chains.push(bg_chain);
            }

            let (crop_l_off, crop_t_off) = self.crop_offset;
            let overlay_chain = format!(
                "[bg][fg]overlay={}+{}:{}+{}:format=auto:eof_action=pass:shortest=1[base]",
                x_pos, crop_l_off, y_pos, crop_t_off
            );
            chains.push(overlay_chain);
            base_label = "base".to_string();
        }

        let mut overlay_count = 0;
        for step in &self.overlays {
            overlay_count += 1;
            let next_label = format!("base{}", overlay_count);

            match step {
                OverlayStep::Media(overlay) => {
                    let overlay_index = input_index;
                    input_index += 1;

                    let loop_mode = overlay.loop_mode.trim().to_lowercase();
                    if overlay.r#type == "image" {
                        extra_inputs.push("-loop".to_string());
                        extra_inputs.push("1".to_string());
                        extra_inputs.push("-framerate".to_string());
                        extra_inputs.push("30".to_string());
                        extra_inputs.push("-i".to_string());
                        extra_inputs.push(overlay.path.clone());
                    } else {
                        if loop_mode == "repeat" {
                            extra_inputs.push("-stream_loop".to_string());
                            extra_inputs.push("-1".to_string());
                        }
                        extra_inputs.push("-i".to_string());
                        extra_inputs.push(overlay.path.clone());
                    }

                    let mut filters = Vec::new();
                    if overlay.r#type == "image" {
                        filters.push("format=rgba".to_string());
                    }
                    if overlay.chroma_key {
                        let norm_color = Self::normalize_color(&overlay.chroma_color);
                        let mode = if overlay.chroma_mode == "colorkey" { "colorkey" } else { "chromakey" };
                        filters.push("format=rgba".to_string());
                        filters.push(format!(
                            "{}={}:{:.3}:{:.3}",
                            mode, norm_color, overlay.chroma_similarity.clamp(0.01, 1.0), overlay.chroma_blend.clamp(0.0, 1.0)
                        ));
                        if overlay.chroma_spill > 0.001 {
                            if let Some(spill_type) = Self::detect_spill_type(&overlay.chroma_color) {
                                filters.push("format=rgba".to_string());
                                filters.push(format!("despill=type={}:mix={:.2}", spill_type, overlay.chroma_spill));
                            }
                        }
                        filters.push("format=rgba".to_string());
                    }

                    if overlay.width > 0 && overlay.height > 0 {
                        filters.push(format!("scale={}:{}", overlay.width, overlay.height));
                    } else {
                        filters.push("scale=iw:ih".to_string());
                    }

                    if overlay.crop_top > 0.0 || overlay.crop_bottom > 0.0 || overlay.crop_left > 0.0 || overlay.crop_right > 0.0 {
                        filters.push(format!(
                            "crop=iw-{}-{}:ih-{}-{}:{}:{}",
                            overlay.crop_left, overlay.crop_right,
                            overlay.crop_top, overlay.crop_bottom,
                            overlay.crop_left, overlay.crop_top
                        ));
                    }

                    if overlay.rotation != 0.0 {
                        filters.push(format!("rotate={rot}*PI/180:c=black@0:ow=iw*abs(cos({rot}*PI/180))+ih*abs(sin({rot}*PI/180)):oh=iw*abs(sin({rot}*PI/180))+ih*abs(cos({rot}*PI/180))", rot=overlay.rotation));
                    }

                    let scale_filter = filters.join(",");
                    let overlay_label = format!("ov{}", overlay_count);
                    
                    let setpts_expr = if overlay.r#type == "video" && overlay.start_offset_seconds > 0.0 {
                        format!("setpts=PTS-STARTPTS+{:.6}/TB", overlay.start_offset_seconds)
                    } else {
                        "setpts=PTS-STARTPTS".to_string()
                    };

                    chains.push(format!(
                        "[{}:v]{},{}[{}]",
                        overlay_index, scale_filter, setpts_expr, overlay_label
                    ));

                    let eof_action = if loop_mode == "stop" { "pass" } else { "repeat" };
                    let shortest_opt = if overlay.r#type == "image" || loop_mode == "repeat" {
                        ":shortest=1"
                    } else {
                        ""
                    };

                    chains.push(format!(
                        "[{}][{}]overlay={}+({}/2.0)-w/2:{}+({}/2.0)-h/2:format=auto:eof_action={}{}[{}]",
                        base_label, overlay_label, overlay.x, overlay.width, overlay.y, overlay.height, eof_action, shortest_opt, next_label
                    ));
                }
                OverlayStep::Text { text, font_size, font_color, font_file, x, y, outline, letter_spacing, font_weight } => {
                    let drawtext_filter = TextOverlayFilter::build(
                        text,
                        *font_size,
                        font_color,
                        font_file.as_deref(),
                        x,
                        y,
                        *outline,
                        *letter_spacing,
                        *font_weight,
                    );

                    chains.push(format!(
                        "[{}]{}[{}]",
                        base_label, drawtext_filter, next_label
                    ));
                }
            }

            base_label = next_label;
        }

        // Inject extra inputs into the main builder command vector
        if !self.extra_inputs_added && !extra_inputs.is_empty() {
            if !self.inputs.is_empty() {
                self.extra_inputs = extra_inputs;
            }
        }

        let output_label = base_label;

        let complex_filter = chains.join(";");
        let mut filter_args = vec![
            "-filter_complex".to_string(),
            complex_filter,
            "-map".to_string(),
            format!("[{}]", output_label),
        ];

        if self.include_audio {
            filter_args.push("-map".to_string());
            filter_args.push("0:a?".to_string());
        }

        filter_args
    }

    fn normalize_color(color: &str) -> String {
        let value = color.trim().trim_start_matches('#');
        if value.len() == 3 {
            let r = &value[0..1];
            let g = &value[1..2];
            let b = &value[2..3];
            format!("0x{}{}{}{}{}{}", r, r, g, g, b, b)
        } else if value.len() == 6 {
            format!("0x{}", value)
        } else if value.starts_with("0x") {
            value.to_string()
        } else {
            format!("0x{}", value)
        }
    }

    fn detect_spill_type(hex_color: &str) -> Option<&'static str> {
        let clean = hex_color.trim().trim_start_matches('#');
        let (r, g, b) = if clean.len() == 3 {
            (
                u8::from_str_radix(&clean[0..1], 16).map(|v| v * 17).unwrap_or(0),
                u8::from_str_radix(&clean[1..2], 16).map(|v| v * 17).unwrap_or(0),
                u8::from_str_radix(&clean[2..3], 16).map(|v| v * 17).unwrap_or(0),
            )
        } else if clean.len() == 6 {
            (
                u8::from_str_radix(&clean[0..2], 16).unwrap_or(0),
                u8::from_str_radix(&clean[2..4], 16).unwrap_or(0),
                u8::from_str_radix(&clean[4..6], 16).unwrap_or(0),
            )
        } else {
            return None;
        };

        if g >= r && g >= b {
            Some("g")
        } else if b >= r && b >= g {
            Some("b")
        } else {
            None
        }
    }
}
