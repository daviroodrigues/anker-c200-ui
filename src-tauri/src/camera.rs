use serde::Serialize;
use std::ffi::{CStr, CString};
use std::fs::{self, File, OpenOptions};
use std::os::unix::fs::OpenOptionsExt;
use std::os::unix::io::AsRawFd;
use std::path::Path;

extern "C" {
    fn c200_control_get(
        fd: libc::c_int,
        name: *const libc::c_char,
        out: *mut libc::c_char,
        out_len: libc::size_t,
    ) -> libc::c_int;

    fn c200_control_set(
        fd: libc::c_int,
        name: *const libc::c_char,
        val: *const libc::c_char,
    ) -> libc::c_int;

    fn c200_set_resolution(fd: libc::c_int, width: u32, height: u32) -> libc::c_int;
}

#[derive(Serialize, Clone, Debug)]
pub struct CameraDevice {
    pub path: String,
    pub name: String,
}

fn open_device(path: &str) -> Result<File, String> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .custom_flags(libc::O_NONBLOCK)
        .open(path)
        .map_err(|e| format!("Erro ao abrir {}: {}", path, e))
}

fn get_control_value(fd: libc::c_int, c_control: &CStr) -> Result<String, std::io::Error> {
    let mut buf = vec![0u8; 128];
    let ret = unsafe {
        c200_control_get(
            fd,
            c_control.as_ptr(),
            buf.as_mut_ptr() as *mut libc::c_char,
            buf.len(),
        )
    };

    if ret < 0 {
        return Err(std::io::Error::last_os_error());
    }

    Ok(
        unsafe { CStr::from_ptr(buf.as_ptr() as *const libc::c_char) }
            .to_string_lossy()
            .to_string(),
    )
}

pub fn list_devices() -> Vec<CameraDevice> {
    let mut devices = Vec::new();

    if let Ok(entries) = fs::read_dir("/sys/class/video4linux") {
        let mut entry_paths: Vec<_> = entries.flatten().map(|e| e.path()).collect();
        entry_paths.sort();

        for path in entry_paths {
            let name_file = path.join("name");
            let dev_name = fs::read_to_string(name_file)
                .unwrap_or_default()
                .trim()
                .to_string();

            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                let dev_path = format!("/dev/{}", file_name);

                if let Ok(file) = open_device(&dev_path) {
                    if let Ok(c_fov) = CString::new("fov") {
                        if get_control_value(file.as_raw_fd(), &c_fov).is_ok() {
                            let display_name = if dev_name.is_empty() {
                                format!("Anker C200 ({})", dev_path)
                            } else {
                                format!("{} ({})", dev_name, dev_path)
                            };

                            devices.push(CameraDevice {
                                path: dev_path,
                                name: display_name,
                            });
                        }
                    }
                }
            }
        }
    }
    devices
}

fn resolve_target_device(device: &str) -> Result<String, String> {
    if !device.is_empty() && Path::new(device).exists() {
        return Ok(device.to_string());
    }

    list_devices()
        .first()
        .map(|d| d.path.clone())
        .ok_or_else(|| "Nenhuma câmera Anker C200 compatível encontrada".to_string())
}

pub fn set_control(device: &str, control: &str, value: &str) -> Result<String, String> {
    let target = resolve_target_device(device)?;
    let file = open_device(&target)?;
    let fd = file.as_raw_fd();

    if control == "resolution" {
        let (width, height) = match value {
            "360p" => (640, 360),
            "720p" => (1280, 720),
            "1080p" => (1920, 1080),
            "2k" => (2560, 1440),
            _ => (1920, 1080),
        };

        let result = unsafe { c200_set_resolution(fd, width, height) };
        if result < 0 {
            return Err("Falha ao definir resolução V4L2".into());
        }
        return Ok(value.to_string());
    }

    let c_control = CString::new(control).map_err(|e| e.to_string())?;
    let c_value = CString::new(value).map_err(|e| e.to_string())?;

    let ret = unsafe { c200_control_set(fd, c_control.as_ptr(), c_value.as_ptr()) };
    if ret < 0 {
        let err = std::io::Error::last_os_error();
        return Err(format!(
            "Falha ao aplicar {} = {} em {}: {}",
            control, value, target, err
        ));
    }

    get_control_value(fd, &c_control).map_err(|e| format!("Erro após set: {}", e))
}

pub fn get_control(device: &str, control: &str) -> Result<String, String> {
    let target = resolve_target_device(device)?;
    let file = open_device(&target)?;
    let c_control = CString::new(control).map_err(|e| e.to_string())?;

    get_control_value(file.as_raw_fd(), &c_control)
        .map_err(|err| format!("Falha ao ler controle {} em {}: {}", control, target, err))
}
