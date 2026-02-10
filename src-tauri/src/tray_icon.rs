/// 生成小鸟托盘图标的 RGBA 像素数据 (64x64)

const SIZE: usize = 64;

pub fn make_bird_rgba(r: u8, g: u8, b: u8) -> Vec<u8> {
    let mut buf = vec![0u8; SIZE * SIZE * 4];
    let (lr, lg, lb) = lighten(r, g, b);

    // 身体
    fill_ellipse(&mut buf, 14, 20, 48, 48, r, g, b);
    // 头
    fill_ellipse(&mut buf, 30, 10, 52, 32, r, g, b);
    // 眼睛
    fill_ellipse(&mut buf, 39, 16, 44, 21, 255, 255, 255);
    // 喙
    fill_polygon(&mut buf, &[(52, 22), (62, 20), (52, 26)], 255, 140, 0);
    // 翅膀
    fill_ellipse(&mut buf, 8, 22, 34, 40, r, g, b);
    // 翅膀高光
    fill_ellipse(&mut buf, 10, 24, 30, 36, lr, lg, lb);
    // 尾巴
    fill_polygon(&mut buf, &[(14, 30), (2, 18), (6, 38)], r, g, b);

    buf
}

/// 灰色鸟 (#888888)
pub fn gray_bird() -> Vec<u8> {
    make_bird_rgba(0x88, 0x88, 0x88)
}

/// 绿色鸟 (#22c55e)
pub fn green_bird() -> Vec<u8> {
    make_bird_rgba(0x22, 0xc5, 0x5e)
}

fn lighten(r: u8, g: u8, b: u8) -> (u8, u8, u8) {
    (r.saturating_add(50), g.saturating_add(50), b.saturating_add(50))
}

fn set_pixel(buf: &mut [u8], x: usize, y: usize, r: u8, g: u8, b: u8) {
    if x < SIZE && y < SIZE {
        let i = (y * SIZE + x) * 4;
        buf[i] = r;
        buf[i + 1] = g;
        buf[i + 2] = b;
        buf[i + 3] = 255;
    }
}

fn fill_ellipse(buf: &mut [u8], x1: i32, y1: i32, x2: i32, y2: i32, r: u8, g: u8, b: u8) {
    let cx = (x1 + x2) as f64 / 2.0;
    let cy = (y1 + y2) as f64 / 2.0;
    let rx = (x2 - x1) as f64 / 2.0;
    let ry = (y2 - y1) as f64 / 2.0;
    let min_y = y1.max(0) as usize;
    let max_y = (y2.min(SIZE as i32) - 1) as usize;
    let min_x = x1.max(0) as usize;
    let max_x = (x2.min(SIZE as i32) - 1) as usize;
    for py in min_y..=max_y {
        for px in min_x..=max_x {
            let dx = (px as f64 - cx) / rx;
            let dy = (py as f64 - cy) / ry;
            if dx * dx + dy * dy <= 1.0 {
                set_pixel(buf, px, py, r, g, b);
            }
        }
    }
}

fn fill_polygon(buf: &mut [u8], pts: &[(i32, i32)], r: u8, g: u8, b: u8) {
    let min_y = pts.iter().map(|p| p.1).min().unwrap().max(0) as usize;
    let max_y = pts.iter().map(|p| p.1).max().unwrap().min(SIZE as i32 - 1) as usize;
    for py in min_y..=max_y {
        let y = py as f64 + 0.5;
        let mut xs = Vec::new();
        let n = pts.len();
        for i in 0..n {
            let (x0, y0) = (pts[i].0 as f64, pts[i].1 as f64);
            let (x1, y1) = (pts[(i + 1) % n].0 as f64, pts[(i + 1) % n].1 as f64);
            if (y0 <= y && y < y1) || (y1 <= y && y < y0) {
                let x = x0 + (y - y0) * (x1 - x0) / (y1 - y0);
                xs.push(x);
            }
        }
        xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        for pair in xs.chunks(2) {
            if pair.len() == 2 {
                let start = (pair[0].ceil() as usize).max(0);
                let end = (pair[1].floor() as usize).min(SIZE - 1);
                for px in start..=end {
                    set_pixel(buf, px, py, r, g, b);
                }
            }
        }
    }
}
