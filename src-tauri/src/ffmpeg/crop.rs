pub struct CropFilter {
    pub aspect_ratio: String,
    pub anchor: String,
}

impl CropFilter {
    pub fn new(aspect_ratio: &str, anchor: &str) -> Self {
        CropFilter {
            aspect_ratio: aspect_ratio.to_string(),
            anchor: anchor.to_string(),
        }
    }

    pub fn to_filter_string(&self) -> Option<String> {
        if self.aspect_ratio == "9:16" {
            let anchor = self.anchor.trim().to_lowercase();
            let wide_expr = "gt(iw/ih\\,9/16)";
            let crop_w = "if(gt(iw/ih\\,9/16)\\,ih*9/16\\,iw)";
            let crop_h = "if(gt(iw/ih\\,9/16)\\,ih\\,iw*16/9)";

            let x_wide = match anchor.as_str() {
                "left" => "0",
                "right" => "(iw-ih*9/16)",
                _ => "(iw-ih*9/16)/2", // Center is default
            };

            let y_tall = match anchor.as_str() {
                "top" => "0",
                "bottom" => "(ih-iw*16/9)",
                _ => "(ih-iw*16/9)/2", // Center is default
            };

            let x_expr = format!("if({},{},(iw-{})/2)", wide_expr, x_wide, crop_w);
            let y_expr = format!("if({},(ih-{})/2,{})", wide_expr, crop_h, y_tall);

            Some(format!("crop={}:{}:{}:{}", crop_w, crop_h, x_expr, y_expr))
        } else {
            None
        }
    }
}
