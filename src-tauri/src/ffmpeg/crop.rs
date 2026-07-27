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
            let crop_w = "if(gt(iw*16,ih*9),ih*9/16,iw)";
            let crop_h = "if(gt(iw*16,ih*9),ih,iw*16/9)";

            let x_expr = match anchor.as_str() {
                "left" => "0".to_string(),
                "right" => "if(gt(iw*16,ih*9),iw-ih*9/16,0)".to_string(),
                _ => "if(gt(iw*16,ih*9),(iw-ih*9/16)/2,0)".to_string(),
            };

            let y_expr = match anchor.as_str() {
                "top" => "0".to_string(),
                "bottom" => "if(gt(iw*16,ih*9),0,ih-iw*16/9)".to_string(),
                _ => "if(gt(iw*16,ih*9),0,(ih-iw*16/9)/2)".to_string(),
            };

            Some(format!("crop=w='{}':h='{}':x='{}':y='{}'", crop_w, crop_h, x_expr, y_expr))
        } else {
            None
        }
    }
}
