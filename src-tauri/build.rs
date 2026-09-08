fn main() {
    #[cfg(target_os = "linux")]
    {
        cc::Build::new()
            .file("c_driver/c200_vendor.c")
            .file("c_driver/c200_fov.c")
            .file("c_driver/c200_controls.c")
            .file("c_driver/c200_api.c")
            .file("c_driver/c200_controls.c")
            .file("c_driver/c200_api.c")
            .file("c_driver/c200_resolution.c")
            .include("c_driver")
            .include("c_driver")
            .flag("-Wall")
            .flag("-Wextra")
            .compile("c200_native");
    }

    tauri_build::build();
}
