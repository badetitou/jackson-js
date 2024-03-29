use crate::{default_context_group::{self, DEFAULT_CONTEXT_GROUP}, utils};
use js_sys::{Array, Boolean, Object, RegExp};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {

    #[wasm_bindgen(extends = Object)]
    pub type JsonDecoratorOptions;
    #[wasm_bindgen(method, getter)]
    pub fn enabled(this: &JsonDecoratorOptions) -> Option<Boolean>;

    #[wasm_bindgen(method, setter)]
    fn set_enabled(this: &JsonDecoratorOptions, val: Boolean);

    pub type InternalDecorators;

    pub type ClassType;

    pub type JsonStringifierParserCommonContext;
    #[wasm_bindgen(method, getter)]
    pub fn withContextGroups(this: &JsonStringifierParserCommonContext) -> Option<Vec<String>>;

    #[wasm_bindgen(method, getter)]
    pub fn _internalDecorators(this: &JsonStringifierParserCommonContext) -> Option<js_sys::Map>;

    #[wasm_bindgen(method, getter)]
    pub fn decoratorsEnabled(this: &JsonStringifierParserCommonContext) -> Option<Object>;

    // Another type

    pub type MakeMetadataKeysWithContextOptions;

    #[wasm_bindgen(method, getter)]
    pub fn contextGroups(this: &MakeMetadataKeysWithContextOptions) -> Option<Vec<String>>;

    #[wasm_bindgen(method, getter)]
    pub fn prefix(this: &MakeMetadataKeysWithContextOptions) -> Option<String>;

    #[wasm_bindgen(method, getter)]
    pub fn suffix(this: &MakeMetadataKeysWithContextOptions) -> Option<String>;

}

#[wasm_bindgen]
pub struct MakeMetadataKeyWithContextOptions {
    #[allow(non_snake_case)]
    contextGroup: Option<String>,
    prefix: Option<String>,
    suffix: Option<String>,
}

#[wasm_bindgen]
impl MakeMetadataKeyWithContextOptions {
    #[wasm_bindgen(constructor)]
    #[allow(non_snake_case)]
    pub fn new(
        contextGroup: Option<String>,
        prefix: Option<String>,
        suffix: Option<String>,
    ) -> MakeMetadataKeyWithContextOptions {
        MakeMetadataKeyWithContextOptions {
            contextGroup,
            prefix,
            suffix,
        }
    }

    #[wasm_bindgen(getter)]
    #[allow(non_snake_case)]
    pub fn contextGroup(&self) -> Option<String> {
        self.contextGroup.clone()
    }

    #[wasm_bindgen(setter)]
    #[allow(non_snake_case)]
    pub fn set_contextGroup(&mut self, value: Option<String>) {
        self.contextGroup = value;
    }

    #[wasm_bindgen(getter)]
    pub fn prefix(&self) -> Option<String> {
        self.prefix.clone()
    }

    #[wasm_bindgen(setter)]
    pub fn set_prefix(&mut self, value: Option<String>) {
        self.prefix = value;
    }

    #[wasm_bindgen(getter)]
    pub fn suffix(&self) -> Option<String> {
        self.suffix.clone()
    }

    #[wasm_bindgen(setter)]
    pub fn set_suffix(&mut self, value: Option<String>) {
        self.suffix = value;
    }
}

#[allow(non_snake_case)]
mod Reflect {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    extern "C" {
        #[wasm_bindgen(js_namespace = Reflect)]
        pub fn getMetadata(
            metadataKey: &str,
            target: &JsValue,
            property_key: &str,
        ) -> Option<crate::util::JsonDecoratorOptions>;

        #[wasm_bindgen(js_namespace = Reflect, js_name = getMetadata)]
        pub fn getMetadata_2(
            metadataKey: &str,
            target: &JsValue,
        ) -> Option<crate::util::JsonDecoratorOptions>;

    }
}

pub fn find_metadata_by_metadata_key_with_context(
    metadata_key_with_context: &str,
    target: &Object,
    property_key: Option<&String>,
    context: Option<&JsonStringifierParserCommonContext>,
) -> Option<JsonDecoratorOptions> {
    let mut json_decorator_options: Option<JsonDecoratorOptions>;
    let has_property_key = property_key.is_some();

    // The logic to get metadata from target and property_key goes here

    match property_key {
        Some(_) => {
            // get metadata from property_key
            json_decorator_options = Reflect::getMetadata(
                metadata_key_with_context,
                target,
                property_key.unwrap().as_str(),
            );
        }
        None => {
            // get metadata from target

            json_decorator_options = Reflect::getMetadata_2(metadata_key_with_context, target);
        }
    }

    let has_context = context.is_some();
    let concrete_context = context.unwrap();
    let mut parent = target.clone();

    while json_decorator_options.is_none() && parent_name(&parent).is_ok() {
        if json_decorator_options.is_none()
            && !has_property_key
            && has_context
            && concrete_context._internalDecorators() != None
        {
            let internal_map: js_sys::Map = concrete_context._internalDecorators().unwrap();
            let map: Option<InternalDecorators> = Some(InternalDecorators::from(js_sys::Map::get(
                &internal_map,
                &parent,
            )));

            if map.is_some() {
                match js_sys::Reflect::get(
                    &map.unwrap(),
                    &JsValue::from_str(metadata_key_with_context),
                ) {
                    Ok(value) => {
                        json_decorator_options = Some(value.into());
                    }
                    Err(_) => {
                        json_decorator_options = None;
                    }
                }
            }
        }

        let prototype = js_sys::Reflect::get_prototype_of(&parent);
        if prototype.is_err() {
            break;
        }
        parent = prototype.unwrap();
    }

    json_decorator_options
}

fn parent_name(parent: &JsValue) -> Result<JsValue, JsValue> {
    return js_sys::Reflect::get(parent, &JsValue::from_str("name"));
}

#[wasm_bindgen]
pub fn make_metadata_key_with_context(
    key: &str,
    options: MakeMetadataKeyWithContextOptions,
) -> Result<String, JsValue> {
    utils::set_panic_hook();
    let reg_exp = RegExp::new(r"^[\w]+$", "");

    if let Some(context_group) = &options.contextGroup {
        if !reg_exp.test(context_group) {
            return Err(JsValue::from_str("Invalid context group name found! The context group name must match \"/^[\\w]+$/\" regular expression, that is a non-empty string which contains any alphanumeric character including the underscore."));
        }
    }

    let context_group: String = options
        .contextGroup
        .unwrap_or(DEFAULT_CONTEXT_GROUP.to_string());
    let prefix = options.prefix.unwrap_or(String::from(""));
    let suffix = options.suffix.unwrap_or(String::from(""));

    let result = format!(
        "jackson:{}:{}{}{}{}",
        context_group,
        prefix,
        if prefix != "" { ":" } else { "" },
        key,
        if suffix != "" {
            format!(":{}", suffix)
        } else {
            String::from("")
        }
    );

    Ok(result)
}

#[wasm_bindgen]
pub fn make_metadata_keys_with_context(
    key: String,
    options: MakeMetadataKeysWithContextOptions,
) -> Vec<String> {
    match options.contextGroups() {
        Some(context_groups) => context_groups
            .iter()
            .map(|context_group| {
                make_metadata_key_with_context(
                    &key,
                    MakeMetadataKeyWithContextOptions::new(
                        Some(context_group.to_string()),
                        options.prefix(),
                        options.suffix(),
                    ),
                )
                .ok()
                .unwrap()
            })
            .collect(),
        None => vec![make_metadata_key_with_context(
            &key,
            MakeMetadataKeyWithContextOptions::new(None, options.prefix(), options.suffix()),
        )
        .ok()
        .unwrap()],
    }
}

pub fn find_metadata(
    metadata_key: &str,
    target: &Object,
    property_key: Option<&String>,
    context: &JsonStringifierParserCommonContext,
) -> Option<JsonDecoratorOptions> {

    let context_groups_with_default = {
        let mut groups = context.withContextGroups().clone().unwrap_or(Vec::new());
        groups.push(default_context_group::DEFAULT_CONTEXT_GROUP.to_string());
        groups
    };

    for context_group in context_groups_with_default {
        let metadata_key_with_context = make_metadata_key_with_context(
            metadata_key,
            MakeMetadataKeyWithContextOptions::new(Some(context_group.clone()), None, None),
        );

        let json_decorator_options = find_metadata_by_metadata_key_with_context(
            &metadata_key_with_context.ok().unwrap(),
            target,
            property_key,
            Some(&context),
        );

        if json_decorator_options.is_some() {
            return json_decorator_options;
        }
    }

    return None;
}

#[wasm_bindgen]
pub fn get_metadata(
    metadata_key: String,
    target: Object,
    property_key: Option<String>,
    context: JsonStringifierParserCommonContext,
) -> JsValue {
    let json_decorator_options = if metadata_key.starts_with("jackson:") {
        find_metadata_by_metadata_key_with_context(
            &metadata_key,
            &target,
            property_key.as_ref(),
            Some(&context),
        )
    } else {
        find_metadata(&metadata_key, &target, property_key.as_ref(), &context)
    };

    if let Some(decorator_options) = json_decorator_options {
        if JsValue::is_undefined(&decorator_options) {
            return JsValue::undefined();
        }

        if let Some(decorators_enabled) = &context.decoratorsEnabled() {
            let decorator_keys: Array = Object::keys(&decorators_enabled);
            let decorator_key = decorator_keys.iter().find(|key| {
                if let Some(key_str) = key.as_string() {
                    if metadata_key.starts_with("jackson:") {
                        metadata_key.contains(&format!(":{}", key_str))
                    } else {
                        metadata_key.starts_with(&key_str)
                    }
                } else {
                    false
                }
            });

            if let Some(decorator_key) = decorator_key {
                let decorator_value = js_sys::Reflect::get(decorators_enabled, &decorator_key).ok();

                if let Some(enabled) = decorator_value {
                    if Boolean::is_type_of(&enabled) {
                        decorator_options.set_enabled(enabled.into());
                    }
                }
            }
        }

        if decorator_options.enabled().is_some() && decorator_options.enabled().unwrap().into() {
            return JsValue::from(decorator_options);
        }
    }
    JsValue::undefined()
}
