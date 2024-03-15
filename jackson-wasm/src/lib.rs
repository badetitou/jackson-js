use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen]
pub fn add(left: usize, right: usize) -> usize {
    return left + right
}

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    return format!("Hey {}, wasm says hello!", name)
}