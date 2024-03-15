
#[cfg(test)]
mod tests {
    use jackson_wasm::add;


    #[test]
    fn it_works() {
        let result = add(2, 2);
        assert_eq!(result, 4);
    }
}
