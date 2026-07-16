pub struct ScaleFilter {
    pub width: u32,
    pub height: u32,
    pub keep_aspect: bool,
}

impl ScaleFilter {
    pub fn new(width: u32, height: u32, keep_aspect: bool) -> Self {
        ScaleFilter {
            width,
            height,
            keep_aspect,
        }
    }

    pub fn to_filter_strings(&self) -> Vec<String> {
        if self.keep_aspect {
            vec![
                format!("scale={}:{}:force_original_aspect_ratio=decrease", self.width, self.height),
                format!("pad={}:{}:(ow-iw)/2:(oh-ih)/2", self.width, self.height),
            ]
        } else {
            vec![format!("scale={}:{}", self.width, self.height)]
        }
    }
}

pub struct CanvasPlacementFilter {
    pub canvas_width: u32,
    pub canvas_height: u32,
    pub video_width: u32,
    pub video_height: u32,
    pub x: i32,
    pub y: i32,
}

impl CanvasPlacementFilter {
    pub fn new(
        canvas_width: u32,
        canvas_height: u32,
        video_width: u32,
        video_height: u32,
        x: i32,
        y: i32,
    ) -> Self {
        CanvasPlacementFilter {
            canvas_width,
            canvas_height,
            video_width,
            video_height,
            x,
            y,
        }
    }

    pub fn to_scale_filter(&self) -> String {
        format!("scale={}:{}", self.video_width, self.video_height)
    }
}
