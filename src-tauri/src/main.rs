#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // NVIDIA + Wayland: ohne das bricht WebKitGTK mit "Error 71 (Protocol error)" ab.
    if std::env::var_os("__NV_DISABLE_EXPLICIT_SYNC").is_none() {
        std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");
    }
    claude_hub_lib::run()
}
