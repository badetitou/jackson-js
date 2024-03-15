use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    pub type JsonDecoratorOptions;

    pub type InternalDecorators;

    pub type ClassType;

    pub type JsonStringifierParserCommonContext;

    #[wasm_bindgen(method, getter)]
    pub fn _internal_decorators(this: &JsonStringifierParserCommonContext) -> Option<js_sys::Map>;
}

#[allow(non_snake_case)]
mod Reflect {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(js_namespace = Reflect)]
        pub fn getMetadata(metadataKey: &str, target: &JsValue, property_key: &str) -> Option<crate::util::JsonDecoratorOptions>;

    }
}

#[allow(non_snake_case)]
mod Object {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(js_namespace = Object)]
        pub fn getPrototypeOf(o: JsValue) -> JsValue;

    }
}



#[wasm_bindgen]
pub fn find_metadata_by_metadata_key_with_context(
    metadata_key_with_context: &str,
    target: JsValue,
    property_key: Option<String>,
    context: Option<JsonStringifierParserCommonContext>,
) -> JsValue {
    let mut json_decorator_options: Option<JsonDecoratorOptions>;
    let has_property_key = property_key.is_some();

    // The logic to get metadata from target and property_key goes here
    match property_key {
        Some(_) => {
            // get metadata from property_key
            json_decorator_options = Reflect::getMetadata(metadata_key_with_context, &target, property_key.unwrap().as_str());
        }
        None => {
            // get metadata from target
            json_decorator_options = Reflect::getMetadata(metadata_key_with_context, &target, "");
        }
    }

    let has_context = context.is_some();
    let concrete_context = context.unwrap();

    let mut parent = target;
    while json_decorator_options.is_none() && parent.is_object() {
        if json_decorator_options.is_none() && !has_property_key && has_context && !concrete_context._internal_decorators().is_some()  {
            let internal_map: js_sys::Map = concrete_context._internal_decorators().unwrap();
            let map : Option<InternalDecorators> = Some(InternalDecorators::from(js_sys::Map::get(&internal_map, &parent)));
            
            if map.is_some() {
                match js_sys::Reflect::get(&map.unwrap(), &JsValue::from_str(metadata_key_with_context))
                {
                    Ok(value) => {
                        json_decorator_options = Some(value.into());
                    }
                    Err(_) => {}
                }
            }
        }

        parent = Object::getPrototypeOf(parent);
    }

    // Convert the result to JsValue before returning
    return json_decorator_options.unwrap().into()
}