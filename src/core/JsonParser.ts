/**
 * @packageDocumentation
 * @module Core
 */

import {
  classHasOwnProperty,
  getArgumentNames,
  getClassProperties,
  getDeepestClass,
  getDefaultPrimitiveTypeValue,
  getMetadata,
  getMetadataKeys,
  hasBigInt,
  hasMetadata,
  isClassIterable,
  isConstructorPrimitiveType,
  isIterableNoMapNoString,
  isSameConstructor,
  isSameConstructorOrExtensionOf,
  isSameConstructorOrExtensionOfNoObject,
  makeMetadataKeysWithContext,
  mapClassPropertyToVirtualProperty,
  mapVirtualPropertiesToClassProperties,
  mapVirtualPropertyToClassProperty, sortMappersByOrder
} from '../util';
import {
  ClassType,
  ClassTypeWithDecoratorDefinitions,
  JsonAliasOptions,
  JsonAppendOptions,
  JsonClassTypeOptions,
  JsonDecoratorOptions,
  JsonDeserializeOptions,
  JsonIdentityInfoOptions,
  JsonIgnorePropertiesOptions,
  JsonInjectOptions,
  JsonManagedReferenceOptions,
  JsonNamingOptions,
  JsonParserContext,
  JsonParserTransformerContext,
  JsonPropertyOptions,
  JsonRootNameOptions,
  JsonSubTypesOptions,
  JsonTypeIdResolverOptions,
  JsonTypeInfoOptions,
  JsonViewOptions,
  InternalDecorators,
  JsonUnwrappedOptions,
  JsonCreatorOptions,
  JsonSetterOptions,
  JsonBackReferenceOptions,
  JsonAnySetterOptions, JsonGetterOptions
} from '../@types';
import {
  JsonPropertyAccess,
  JsonTypeInfoAs,
  JsonTypeInfoId,
  PropertyNamingStrategy,
  defaultCreatorName,
  JsonCreatorMode,
  JsonSetterNulls
} from '../decorators';
import {JacksonError} from './JacksonError';
// import * as cloneDeep from 'lodash.clonedeep';
import * as clone from 'lodash.clone';
import {DefaultDeserializationFeatureValues} from '../databind';

/**
 * Json Parser Global Context used by {@link JsonParser.transform} to store global information.
 */
interface JsonParserGlobalContext {
  /**
   * Map used to restore object circular references defined by {@link JsonIdentityInfo}.
   */
  globalValueAlreadySeen: Map<string, any>;
  /**
   * Map used to store unresolved object identities defined by {@link JsonIdentityInfo}.
   */
  globalUnresolvedObjectIdentities: Set<string>;
}

/**
 * JsonParser provides functionality for reading JSON.
 * It is also highly customizable to work both with different styles of JSON content,
 * and to support more advanced Object concepts such as polymorphism and Object identity.
 */
export class JsonParser<T> {
  /**
   * Default context to use during deserialization.
   */
  defaultContext: JsonParserContext = {};

  /**
   * Cache propagateDecorators
   */
  propagateDecoratorsCache:
  Map<Record<string, any>, Map<string, Map<string|symbol, JsonDecoratorOptions>>> = new Map();

  /**
   *
   * @param defaultContext - Default context to use during deserialization.
   */
  constructor(defaultContext: JsonParserContext = JsonParser.makeDefaultContext()) {
    this.defaultContext = defaultContext;
  }

  /**
   * Make a default {@link JsonParserContext}.
   */
  static makeDefaultContext(): JsonParserContext {
    return {
      mainCreator: null,
      features: {
        deserialization: {
          ...DefaultDeserializationFeatureValues
        }
      },
      deserializers: [],
      decoratorsEnabled: {},
      withViews: null,
      forType: new Map(),
      withContextGroups: [],
      _internalDecorators: new Map(),
      _propertyParentCreator: null,
      injectableValues: {},
      withCreatorName: null
    };
  }

  /**
   * Merge multiple {@link JsonParserContext} into one.
   * Array direct properties will be concatenated, instead, Map and Object Literal direct properties will be merged.
   * All the other properties, such as {@link JsonParserContext.mainCreator}, will be completely replaced.
   *
   * @param contexts - list of contexts to be merged.
   */
  static mergeContexts(contexts: JsonParserContext[]): JsonParserContext {
    const finalContext = JsonParser.makeDefaultContext();
    for (const context of contexts) {
      if (context == null) {
        continue;
      }
      if (context.mainCreator != null) {
        finalContext.mainCreator = context.mainCreator;
      }
      if (context.decoratorsEnabled != null) {
        finalContext.decoratorsEnabled = {
          ...finalContext.decoratorsEnabled,
          ...context.decoratorsEnabled
        };
      }
      if (context.withViews != null) {
        finalContext.withViews = context.withViews;
      }
      if (context.withContextGroups != null) {
        finalContext.withContextGroups = finalContext.withContextGroups.concat(context.withContextGroups);
      }
      if (context.deserializers != null) {
        finalContext.deserializers = finalContext.deserializers.concat(context.deserializers);
      }
      if (context.features != null && context.features.deserialization != null) {
        finalContext.features.deserialization = {
          ...finalContext.features.deserialization,
          ...context.features.deserialization
        };
      }
      if (context.forType != null) {
        finalContext.forType = new Map([
          ...finalContext.forType,
          ...context.forType]
        );
      }
      if (context.injectableValues != null) {
        finalContext.injectableValues = {
          ...finalContext.injectableValues,
          ...context.injectableValues
        };
      }
      if (context.withCreatorName != null) {
        finalContext.withCreatorName = context.withCreatorName;
      }
      if (context._internalDecorators != null) {
        finalContext._internalDecorators = new Map([
          ...finalContext._internalDecorators,
          ...context._internalDecorators]
        );
      }
      if (context._propertyParentCreator != null) {
        finalContext._propertyParentCreator = context._propertyParentCreator;
      }
    }
    finalContext.deserializers = sortMappersByOrder(finalContext.deserializers);
    return finalContext;
  }

  /**
   * Method for deserializing a JSON string into a JavaScript object or value.
   *
   * @param text - the JSON string to be deserialized.
   * @param context - the context to be used during deserialization.
   */
  parse(text: string, context?: JsonParserContext): T {
    const value = JSON.parse(text);
    return this.transform(value, context);
  }

  /**
   * Method for applying json decorators to a JavaScript object/value parsed.
   * It returns a JavaScript object/value with json decorators applied.
   *
   * @param value - the JavaScript object or value to be postprocessed.
   * @param context - the context to be used during deserialization postprocessing.
   */
  transform(value: any, context?: JsonParserContext): any {
    const globalContext: JsonParserGlobalContext = {
      globalValueAlreadySeen: new Map<string, any>(),
      globalUnresolvedObjectIdentities: new Set<string>()
    };

    context = JsonParser.mergeContexts([this.defaultContext, context]);

    let newContext: JsonParserTransformerContext = this.convertParserContextToTransformerContext(context);

    newContext.mainCreator = (newContext.mainCreator && newContext.mainCreator[0] !== Object) ?
      newContext.mainCreator : [(value != null) ? value.constructor : Object];
    newContext._propertyParentCreator = newContext.mainCreator[0];
    newContext._internalDecorators = new Map();
    // BVER was cloneDeep
    newContext = clone(newContext);

    const postProcessedObj = this.deepTransform('', value, undefined, newContext, globalContext);
    if (globalContext.globalUnresolvedObjectIdentities.size > 0 &&
      newContext.features.deserialization.FAIL_ON_UNRESOLVED_OBJECT_IDS) {
      throw new JacksonError(`Found unresolved Object Ids: ${[...globalContext.globalUnresolvedObjectIdentities].join(', ')}`);
    }
    return postProcessedObj;
  }

  /**
   * Recursive {@link JsonParser.transform}.
   *
   * @param key - key name representing the object property being postprocessed.
   * @param value - the JavaScript object or value to postprocessed.
   * @param parent - the parent object of value (if available)
   * @param context - the context to be used during deserialization postprocessing.
   * @param globalContext - the global context to be used during deserialization postprocessing.
   */
  private deepTransform(key: string, value: any, parent: any,
                        context: JsonParserTransformerContext, globalContext: JsonParserGlobalContext): any {
    context = {
      withContextGroups: [],
      features: {
        deserialization: {}
      },
      deserializers: [],
      injectableValues: {},
      decoratorsEnabled: {},
      _internalDecorators: new Map(),
      ...context
    };

    // BVER: Seems to have no impact so commented for now
    // context = cloneDeep(context);

    if (value != null && context._internalDecorators != null &&
      context._internalDecorators.size > 0) {
      let target = context.mainCreator[0];
      while (target.name && !context._internalDecorators.has(target)) {
        target = Object.getPrototypeOf(target);
      }
      if (context._internalDecorators.has(target)) {
        if (context._internalDecorators.get(target).depth === 0) {
          context._internalDecorators.delete(target);
        } else {
          context._internalDecorators.get(target).depth--;
        }
      }
    }

    if (context.forType && context.forType.has(context.mainCreator[0])) {
      context = {
        mainCreator: context.mainCreator,
        ...context,
        ...context.forType.get(context.mainCreator[0])
      };
    }

    const currentMainCreator = context.mainCreator[0];

    const { found: customDeserialized, value: customValue } = this.invokeCustomDeserializers(key, value, context);
    if (customDeserialized) {
      return customValue;
    }

    value = this.parseJsonDeserializeClass(value, context);

    if (value != null && context.features.deserialization.ALLOW_COERCION_OF_SCALARS) {
      if (value.constructor === String) {
        if (isSameConstructorOrExtensionOfNoObject(currentMainCreator, Number)) {
          value = +value;
        } else if (hasBigInt && isSameConstructorOrExtensionOfNoObject(currentMainCreator, BigInt)) {
          value = BigInt(+value);
        } else if (isSameConstructorOrExtensionOfNoObject(currentMainCreator, Boolean)) {
          if (value.toLowerCase() === 'true' || value === '1') {
            value = true;
          } else if (value.toLowerCase() === 'false' || value === '0') {
            value = false;
          } else {
            value = !!value;
          }
        }
      } else if (value.constructor === Number) {
        if (isSameConstructorOrExtensionOfNoObject(currentMainCreator, Boolean)) {
          value = !!value;
        } else if (hasBigInt && isSameConstructorOrExtensionOfNoObject(currentMainCreator, BigInt)) {
          value = BigInt(+value);
        } else if (isSameConstructorOrExtensionOfNoObject(currentMainCreator, String)) {
          // @ts-ignore
          value += '';
        }
      } else if (value.constructor === Boolean) {
        if (isSameConstructorOrExtensionOfNoObject(currentMainCreator, Number)) {
          value = value ? 1 : 0;
        } else if (hasBigInt && isSameConstructorOrExtensionOfNoObject(currentMainCreator, BigInt)) {
          value = BigInt(value ? 1 : 0);
        } else if (isSameConstructorOrExtensionOfNoObject(currentMainCreator, String)) {
          // @ts-ignore
          value += '';
        }
      }
    }

    if (value == null && isConstructorPrimitiveType(context.mainCreator[0])) {
      value = this.getDefaultValue(context);
    }

    if (value == null && context.features.deserialization.FAIL_ON_NULL_FOR_PRIMITIVES &&
      isConstructorPrimitiveType(currentMainCreator)) {
      // eslint-disable-next-line max-len
      throw new JacksonError(`Cannot map "${value}" into primitive type ${(currentMainCreator as ObjectConstructor).name}` +
        ( (context._propertyParentCreator != null && context._propertyParentCreator !== Object && key !== '') ?
          ` for ${context._propertyParentCreator.name}["${key}"]` :
          (key !== '' ? ' for property ' + key : '') ));
    }

    if ( (value instanceof Array && value.length === 0 &&
      context.features.deserialization.ACCEPT_EMPTY_ARRAY_AS_NULL_OBJECT) ||
      (value != null && value.constructor === String && value.length === 0 &&
        context.features.deserialization.ACCEPT_EMPTY_STRING_AS_NULL_OBJECT) ) {
      value = null;
    }

    // if (value != null && value.constructor === Number &&
    //   context.features.deserialization.ACCEPT_FLOAT_AS_INT && isFloat(value)) {
    //   value = parseInt(value + '', 10);
    // }

    if (value != null) {

      let instance = this.getInstanceAlreadySeen(key, value, context, globalContext);
      if (instance !== undefined) {
        return instance;
      }

      value = this.parseJsonTypeInfo(value, parent, context);

      if (isSameConstructorOrExtensionOfNoObject(currentMainCreator, Map) ||
          (typeof value === 'object' && !isIterableNoMapNoString(value) && currentMainCreator === Object)) {
        return this.parseMapAndObjLiteral(key, value, context, globalContext);
      } else if (hasBigInt && isSameConstructorOrExtensionOfNoObject(currentMainCreator, BigInt)) {
        return (value != null && value.constructor === String && value.endsWith('n')) ?
          // @ts-ignore
          currentMainCreator(value.substring(0, value.length - 1)) :
          // @ts-ignore
          currentMainCreator(value);
      } else if (isSameConstructorOrExtensionOfNoObject(currentMainCreator, RegExp)) {
        // @ts-ignore
        return new currentMainCreator(value);
      } else if (isSameConstructorOrExtensionOfNoObject(currentMainCreator, Date)) {
        // @ts-ignore
        return new currentMainCreator(value);
      } else if (typeof value === 'object' && !isIterableNoMapNoString(value)) {

        if (this.parseJsonIgnoreType(context)) {
          return null;
        }

        let replacement = clone(value);
        replacement = this.parseJsonRootName(replacement, context);

        this.parseJsonUnwrapped(replacement, context);
        this.parseJsonVirtualPropertyAndJsonAlias(replacement, context);
        this.parseJsonNaming(replacement, context);

        let keys = Object.keys(replacement);
        if (context.features.deserialization.ACCEPT_CASE_INSENSITIVE_PROPERTIES) {
          const classProperties = getClassProperties(currentMainCreator, null, context);
          const caseInsesitiveKeys = keys.map((k) => k.toLowerCase());
          for (const classProperty of classProperties) {
            const index = caseInsesitiveKeys.indexOf(classProperty.toLowerCase());
            if (index >= 0) {
              replacement[classProperty] = replacement[keys[index]];
              delete replacement[keys[index]];
              keys[index] = classProperty;
            }
          }
        }
        keys = mapVirtualPropertiesToClassProperties(currentMainCreator, keys, context, {checkSetters: true});

        const classPropertiesToBeExcluded: string[] = [];

        for (const k of keys) {
          if (classHasOwnProperty(currentMainCreator, k, replacement, context, {withSettersAsProperty: true})) {
            const jsonClass: JsonClassTypeOptions = getMetadata('JsonClassType', context.mainCreator[0], k, context);
            this.propagateDecorators(jsonClass, replacement, k, context);

            if (this.parseHasJsonIgnore(context, k) || !this.parseIsIncludedByJsonViewProperty(context, k)) {
              classPropertiesToBeExcluded.push(k);
              delete replacement[k];
            } else {
              this.parseJsonRawValue(context, replacement, k);
              this.parseJsonDeserializeProperty(k, replacement, context);
            }
          }
        }
        instance = this.parseJsonCreator(context, globalContext, replacement, parent, classPropertiesToBeExcluded);
        if (instance) {
          replacement = instance;
        }

        return replacement;
      } else if (isIterableNoMapNoString(value)) {
        const replacement = this.parseIterable(value, key, context, globalContext);
        return replacement;
      }
    }

    return value;
  }

  /**
   *
   * @param context
   */
  private convertParserContextToTransformerContext(context: JsonParserContext): JsonParserTransformerContext {
    const newContext: JsonParserTransformerContext = {
      mainCreator: context.mainCreator ? context.mainCreator() : [Object]
    };
    for (const key in context) {
      if (key !== 'mainCreator') {
        newContext[key] = context[key];
      }
    }
    return newContext;
  }

  /**
   *
   * @param context
   */
  private getDefaultValue(context: JsonParserTransformerContext): any | null {
    let defaultValue = null;
    const currentMainCreator = context.mainCreator[0];
    if (currentMainCreator === String &&
      (context.features.deserialization.SET_DEFAULT_VALUE_FOR_PRIMITIVES_ON_NULL ||
        context.features.deserialization.SET_DEFAULT_VALUE_FOR_STRING_ON_NULL) ) {
      defaultValue = getDefaultPrimitiveTypeValue(String);
    } else if (currentMainCreator === Number &&
      (context.features.deserialization.SET_DEFAULT_VALUE_FOR_PRIMITIVES_ON_NULL ||
        context.features.deserialization.SET_DEFAULT_VALUE_FOR_NUMBER_ON_NULL) ) {
      defaultValue = getDefaultPrimitiveTypeValue(Number);
    } else if (currentMainCreator === Boolean &&
      (context.features.deserialization.SET_DEFAULT_VALUE_FOR_PRIMITIVES_ON_NULL ||
        context.features.deserialization.SET_DEFAULT_VALUE_FOR_BOOLEAN_ON_NULL) ) {
      defaultValue = getDefaultPrimitiveTypeValue(Boolean);
    } else if (hasBigInt && currentMainCreator === BigInt &&
      (context.features.deserialization.SET_DEFAULT_VALUE_FOR_PRIMITIVES_ON_NULL ||
        context.features.deserialization.SET_DEFAULT_VALUE_FOR_BIGINT_ON_NULL) ) {
      defaultValue = getDefaultPrimitiveTypeValue(BigInt);
    }
    return defaultValue;
  }

  /**
   * Propagate decorators to class properties or parameters,
   * only for the first level (depth) of recursion.
   *
   * Used, for example, in case of decorators applied on an iterable, such as an Array.
   * In this case, the decorators are applied to each item of the iterable and not on the iterable itself.
   *
   * @param jsonClass
   * @param key
   * @param context
   * @param methodName
   * @param argumentIndex
   */
  private propagateDecorators(jsonClass: JsonClassTypeOptions,
                              obj: any,
                              key: string,
                              context: JsonParserTransformerContext,
                              methodName?: string,
                              argumentIndex?: number): void {
    const currentMainCreator = context.mainCreator[0];

    // Decorators list that can be propagated
    const metadataKeysParamForDeepestClass = [
      'JsonIgnorePropertiesParam:' + argumentIndex,
      'JsonTypeInfoParam:' + argumentIndex,
      'JsonSubTypesParam:' + argumentIndex,
      'JsonTypeIdResolverParam:' + argumentIndex,
      'JsonIdentityInfoParam:' + argumentIndex
    ];

    // Decorators list that can be propagated
    const metadataKeysForDeepestClass = [
      'JsonIgnoreProperties',
      'JsonTypeInfo',
      'JsonSubTypes',
      'JsonTypeIdResolver',
      'JsonIdentityInfo',
    ];

    const metadataKeysForFirstClass = [
      'JsonDeserializeParam:' + argumentIndex
    ];

    let deepestClass = null;
    const decoratorsNameFoundForDeepestClass: string[] = [];
    const decoratorsToBeAppliedForDeepestClass: InternalDecorators = {
      depth: 1
    };

    let firstClass = null;
    const decoratorsNameFoundForFirstClass: string[] = [];
    const decoratorsToBeAppliedForFirstClass: InternalDecorators = {
      depth: 1
    };

    if (jsonClass) {
      firstClass = jsonClass.type()[0];
      deepestClass = getDeepestClass(jsonClass.type());
    } else {
      firstClass = (obj[key] != null) ? obj[key].constructor : Object;
      deepestClass = (obj[key] != null) ? obj[key].constructor : Object;
    }

    for (const metadataKey of metadataKeysForDeepestClass) {
      const jsonDecoratorOptions: JsonDecoratorOptions = this.cachedGetMetadata(metadataKey, currentMainCreator, key, context);

      if (jsonDecoratorOptions) {
        const metadataKeysWithContext =
          makeMetadataKeysWithContext(metadataKey, {contextGroups: jsonDecoratorOptions.contextGroups});
        for (const metadataKeyWithContext of metadataKeysWithContext) {
          decoratorsToBeAppliedForDeepestClass[metadataKeyWithContext] = jsonDecoratorOptions;
        }
        decoratorsNameFoundForDeepestClass.push(metadataKey);
      }
    }

    for (const metadataKey of metadataKeysParamForDeepestClass) {
      const indexOfParam = metadataKey.indexOf('Param:');

      const jsonDecoratorOptions: JsonDecoratorOptions = this.cachedGetMetadata(metadataKey, currentMainCreator, methodName, context);

      if (jsonDecoratorOptions) {
        if (deepestClass != null && methodName != null && argumentIndex != null) {
          const jsonClassParam: JsonClassTypeOptions =
            this.cachedGetMetadata('JsonClassTypeParam:' + argumentIndex, currentMainCreator, methodName, context) as JsonClassTypeOptions;

          const metadataKeysWithContext =
            makeMetadataKeysWithContext(metadataKey.substring(0, indexOfParam),
              {contextGroups: jsonDecoratorOptions.contextGroups});
          for (const metadataKeyWithContext of metadataKeysWithContext) {
            decoratorsToBeAppliedForDeepestClass[metadataKeyWithContext] = jsonDecoratorOptions;
          }

          if (jsonClassParam == null) {
            deepestClass = null;
          } else {
            const jsonClassMetadataKeysWithContext =
              makeMetadataKeysWithContext('JsonClassType', {contextGroups: jsonClassParam.contextGroups});
            for (const metadataKeyWithContext of jsonClassMetadataKeysWithContext) {
              decoratorsToBeAppliedForDeepestClass[metadataKeyWithContext] = jsonClassParam;
            }
          }

          decoratorsNameFoundForDeepestClass.push(metadataKey.substring(0, indexOfParam));
        } else {
          const metadataKeysWithContext =
            makeMetadataKeysWithContext(metadataKey, {contextGroups: jsonDecoratorOptions.contextGroups});
          for (const metadataKeyWithContext of metadataKeysWithContext) {
            decoratorsToBeAppliedForDeepestClass[metadataKeyWithContext] = jsonDecoratorOptions;
          }

          decoratorsNameFoundForDeepestClass.push(metadataKey);
        }
      }
    }

    for (const metadataKey of metadataKeysForFirstClass) {

      const indexOfParam = metadataKey.indexOf('Param:');

      const jsonDecoratorOptions: JsonDecoratorOptions = indexOfParam !== -1 ?
        this.cachedGetMetadata(metadataKey, currentMainCreator, methodName, context) :
        this.cachedGetMetadata(metadataKey, currentMainCreator, key, context);

      if (jsonDecoratorOptions) {
        if (metadataKey.includes('Param:') && firstClass != null && methodName != null && argumentIndex != null) {
          const jsonClassParam: JsonClassTypeOptions =
            this.cachedGetMetadata('JsonClassTypeParam:' + argumentIndex, currentMainCreator, methodName, context) as JsonClassTypeOptions;

          const metadataKeysWithContext =
            makeMetadataKeysWithContext(metadataKey.substring(0, indexOfParam),
              {contextGroups: jsonDecoratorOptions.contextGroups});
          for (const metadataKeyWithContext of metadataKeysWithContext) {
            decoratorsToBeAppliedForFirstClass[metadataKeyWithContext] = jsonDecoratorOptions;
          }

          if (jsonClassParam == null) {
            firstClass = null;
          } else {
            const jsonClassMetadataKeysWithContext =
              makeMetadataKeysWithContext('JsonClassType', {contextGroups: jsonClassParam.contextGroups});
            for (const metadataKeyWithContext of jsonClassMetadataKeysWithContext) {
              decoratorsToBeAppliedForFirstClass[metadataKeyWithContext] = jsonClassParam;
            }
          }

          decoratorsNameFoundForFirstClass.push(metadataKey.substring(0, indexOfParam));
        } else {
          const metadataKeysWithContext =
            makeMetadataKeysWithContext(metadataKey, {contextGroups: jsonDecoratorOptions.contextGroups});
          for (const metadataKeyWithContext of metadataKeysWithContext) {
            decoratorsNameFoundForFirstClass[metadataKeyWithContext] = jsonDecoratorOptions;
          }

          decoratorsNameFoundForFirstClass.push(metadataKey);
        }
      }
    }

    if (deepestClass != null && decoratorsNameFoundForDeepestClass.length > 0) {
      context._internalDecorators.set(deepestClass, decoratorsToBeAppliedForDeepestClass);
    }
    if (firstClass != null && decoratorsNameFoundForFirstClass.length > 0) {
      context._internalDecorators.set(firstClass, decoratorsToBeAppliedForFirstClass);
    }
  }

  /**
   * This method implements a cache that can be used instead of calling directly the getMetadata of util.ts
   */
  private cachedGetMetadata(metadataKey: string,
                            target: ClassType<any>,
                            propertyKey: string | symbol = null,
                            context: JsonParserTransformerContext) {
    if (this.propagateDecoratorsCache.has(target)
      && this.propagateDecoratorsCache.get(target).has(metadataKey)
      && this.propagateDecoratorsCache.get(target).get(metadataKey).has(propertyKey)) {
      return this.propagateDecoratorsCache.get(target).get(metadataKey).get(propertyKey);
    }

    if (!this.propagateDecoratorsCache.has(target)) {
      this.propagateDecoratorsCache.set(target, new Map<string, Map<string|symbol, JsonDecoratorOptions>>());
    }
    if (!this.propagateDecoratorsCache.get(target).has(metadataKey)) {
      this.propagateDecoratorsCache.get(target).set(metadataKey, new Map<string|symbol, JsonDecoratorOptions>());
    }
    return this.propagateDecoratorsCache.get(target).get(metadataKey)
      .set(propertyKey, getMetadata(metadataKey, target, propertyKey, context)).get(propertyKey);
  }

  /**
   *
   * @param key
   * @param value
   * @param context
   */
  private invokeCustomDeserializers(key: string, value: any, context: JsonParserTransformerContext): { value: any; found: boolean } {
    if (context.deserializers) {
      const currentMainCreator = context.mainCreator[0];
      for (const deserializer of context.deserializers) {
        if (deserializer.type != null) {
          const classType = deserializer.type();
          if (
            (value != null && typeof classType === 'string' && classType !== typeof value) ||
            (typeof classType !== 'string' && currentMainCreator != null &&
              !isSameConstructorOrExtensionOf(classType, currentMainCreator))
          ) {
            continue;
          }
        }
        const virtualProperty = mapClassPropertyToVirtualProperty(currentMainCreator, key, context);
        return {
          found: true,
          value: deserializer.mapper(virtualProperty, value, context),
        };
      }
    }
    return { value: undefined, found: false };
  }

  /**
   *
   * @param key
   * @param value
   * @param context
   * @param globalContext
   */
  private getInstanceAlreadySeen(key: string, value: any, context: JsonParserTransformerContext,
                                 globalContext: JsonParserGlobalContext): undefined | null | any {
    const currentMainCreator = context.mainCreator[0];
    const jsonIdentityInfo: JsonIdentityInfoOptions =
      this.cachedGetMetadata('JsonIdentityInfo', currentMainCreator, null, context) as JsonIdentityInfoOptions;

    if (jsonIdentityInfo) {
      const id: string = typeof value === 'object' ? value[jsonIdentityInfo.property] : value;

      const scope: string = jsonIdentityInfo.scope || '';
      const scopedId = this.generateScopedId(scope, id);

      if (globalContext.globalValueAlreadySeen.has(scopedId)) {
        const instance = globalContext.globalValueAlreadySeen.get(scopedId);
        if (!(currentMainCreator.prototype.isPrototypeOf(instance))) {
          throw new JacksonError(`Already had Class "${instance.constructor.name}" for id ${id}.`);
        }
        globalContext.globalUnresolvedObjectIdentities.delete(scopedId);

        return instance;
      } else if (typeof value !== 'object') {
        globalContext.globalUnresolvedObjectIdentities.add(scopedId);
        if (!context.features.deserialization.FAIL_ON_UNRESOLVED_OBJECT_IDS) {
          return null;
        }
      }
    }

    return undefined;
  }

  /**
   *
   * @param context
   * @param globalContext
   * @param obj
   * @param parent
   * @param classPropertiesToBeExcluded
   */
  private parseJsonCreator(context: JsonParserTransformerContext, globalContext: JsonParserGlobalContext,
                           obj: any, parent: any, classPropertiesToBeExcluded: string[]): any {
    if (obj == null) {
      return null;
    }

    const currentMainCreator = context.mainCreator[0];
    context._propertyParentCreator = currentMainCreator;

    const withCreatorName = context.withCreatorName;

    const jsonCreatorMetadataKey = 'JsonCreator:' + ((withCreatorName != null) ? withCreatorName : defaultCreatorName);

    const hasJsonCreator =
      hasMetadata(jsonCreatorMetadataKey, currentMainCreator, null, context);

    const jsonCreator: JsonCreatorOptions | ClassType<any> = (hasJsonCreator) ?
      this.cachedGetMetadata(jsonCreatorMetadataKey, currentMainCreator, null, context) :
      currentMainCreator;

    const jsonCreatorMode = ('mode' in jsonCreator && jsonCreator.mode) ? jsonCreator.mode : undefined;

    const jsonIgnoreProperties: JsonIgnorePropertiesOptions =
      this.cachedGetMetadata('JsonIgnoreProperties', currentMainCreator, null, context);

    const method: any = (hasJsonCreator) ?
      (((jsonCreator as JsonCreatorOptions)._ctor) ?
        (jsonCreator as JsonCreatorOptions)._ctor :
        (jsonCreator as JsonCreatorOptions)._method)
      : jsonCreator;

    let props: [string, any][];
    let propNames: string[];
    let propNamesAliasToBeExcluded: string[];

    let instance: any;

    if (jsonCreatorMode !== JsonCreatorMode.DELEGATING) {

      if (jsonCreatorMode === JsonCreatorMode.PROPERTIES_OBJECT) {
        propNames = getClassProperties(currentMainCreator, obj, context);
      } else {
        propNames = method ? getArgumentNames(method) : [];
      }

      const methodName = ('_propertyKey' in jsonCreator && jsonCreator._propertyKey) ? jsonCreator._propertyKey : 'constructor';
      const result = this.parseCreatorProperties(methodName, method, obj, parent, context, globalContext, propNames, true);
      props = result.props != null && result.props.length > 0 ? result.props : [['', obj]];
      propNamesAliasToBeExcluded = result.propNamesAliasToBeExcluded;

      if (jsonCreatorMode === JsonCreatorMode.PROPERTIES_OBJECT) {
        instance = {};
        props.forEach(([key, value]) => (instance[key] = value));
      } else {
        const args = props.map(([, value]) => value);
        instance = ('_method' in jsonCreator && jsonCreator._method) ?
          (method as Function)(...args) : new (method as ObjectConstructor)(...args);
      }
    } else {
      instance = ('_method' in jsonCreator && jsonCreator._method) ?
        (method as Function)(obj) : new (method as ObjectConstructor)(obj);
    }

    this.parseJsonIdentityInfo(instance, obj, context, globalContext);

    const jsonAppendAttributesToBeExcluded = [];
    const jsonAppend: JsonAppendOptions =
      this.cachedGetMetadata('JsonAppend', currentMainCreator, null, context);
    if (jsonAppend && jsonAppend.attrs && jsonAppend.attrs.length > 0) {
      for (const attr of jsonAppend.attrs) {
        if (attr.value) {
          jsonAppendAttributesToBeExcluded.push(attr.value);
        }
        if (attr.propName) {
          jsonAppendAttributesToBeExcluded.push(attr.propName);
        }
      }
    }

    if (jsonCreatorMode !== JsonCreatorMode.DELEGATING) {
      const keysToBeExcluded = new Set([
        ...propNames,
        ...propNamesAliasToBeExcluded,
        ...jsonAppendAttributesToBeExcluded,
        ...classPropertiesToBeExcluded
      ]);

      const classKeys = getClassProperties(currentMainCreator, obj, context, {
        withSettersAsProperty: true
      });

      const remainingKeys = classKeys.filter(k => Object.hasOwnProperty.call(obj, k) && !keysToBeExcluded.has(k));
      let unknownKeys = [];

      const hasJsonAnySetter =
        hasMetadata('JsonAnySetter', currentMainCreator, null, context);
      // add remaining properties and ignore the ones that are not part of "instance"
      for (const key of remainingKeys) {
        const jsonVirtualProperty: JsonPropertyOptions | JsonSetterOptions =
          getMetadata('JsonVirtualProperty:' + key, currentMainCreator, null, context);

        if (jsonVirtualProperty && jsonVirtualProperty._descriptor != null) {
          if (typeof jsonVirtualProperty._descriptor.value === 'function' || jsonVirtualProperty._descriptor.set != null ||
            jsonVirtualProperty._descriptor.get == null) {
            this.parseJsonSetter(instance, obj, key, parent, context, globalContext);
          } else {
            // if property has a descriptor but is not a function and doesn't have a setter,
            // then this property has only getter, so we can skip it.
            continue;
          }
        } else if ((Object.hasOwnProperty.call(obj, key) && classHasOwnProperty(currentMainCreator, key, null, context)) ||
          currentMainCreator.name === 'Object') {
          instance[key] = this.parseJsonClassType(context, globalContext, obj, key, parent);
        } else if (hasJsonAnySetter && Object.hasOwnProperty.call(obj, key)) {
          // for any other unrecognized properties found
          this.parseJsonAnySetter(instance, obj, key, context);
        } else if (!classHasOwnProperty(currentMainCreator, key, null, context) &&
          ( (jsonIgnoreProperties == null && context.features.deserialization.FAIL_ON_UNKNOWN_PROPERTIES) ||
            (jsonIgnoreProperties != null && !jsonIgnoreProperties.ignoreUnknown)) ) {
          unknownKeys.push(key);
        }
      }
      // ignore keys removed from parent (e.g. synthetic keys for polymorphism)
      const removedKeys = remainingKeys.filter(k => !Object.hasOwnProperty.call(obj, k));
      unknownKeys = unknownKeys.filter(k => !removedKeys.includes(k));

      if (unknownKeys.length) {
        // eslint-disable-next-line max-len
        throw new JacksonError(`Unknown properties [${unknownKeys}] for ${currentMainCreator.name} at [Source '${JSON.stringify(obj)}']`);
      }
    }

    const classProperties = getClassProperties(currentMainCreator, null, context);

    for (const classProperty of classProperties) {

      /*
      if (!Object.hasOwnProperty.call(instance, classProperty) &&
        !Object.getOwnPropertyDescriptor(currentMainCreator.prototype, classProperty)) {
        instance[classProperty] = undefined; // set to undefined all the missing class properties (but not descriptors!)
      }
      */

      this.parseJsonInject(instance, obj, classProperty, context);
      // if there is a reference, convert the reference property to the corresponding Class
      this.parseJsonManagedReference(instance, context, obj, classProperty);
    }

    if (jsonCreatorMode === JsonCreatorMode.PROPERTIES_OBJECT) {
      instance = ('_method' in jsonCreator && jsonCreator._method) ?
        (method as Function)(instance) : new (method as ObjectConstructor)(instance);
    }

    return instance;
  }

  /**
   *
   * @param replacement
   * @param obj
   * @param key
   * @param context
   */
  private parseJsonInject(replacement: any, obj: any, key: string, context: JsonParserTransformerContext) {
    const currentMainCreator = context.mainCreator[0];

    let propertySetter;
    let jsonInject: JsonInjectOptions =
      this.cachedGetMetadata('JsonInject', currentMainCreator, key, context);
    if (!jsonInject) {
      propertySetter = mapVirtualPropertyToClassProperty(currentMainCreator, key, context, {checkSetters: true});
      jsonInject = this.cachedGetMetadata('JsonInject', currentMainCreator, propertySetter, context);
    }
    if ( jsonInject && (!jsonInject.useInput || (jsonInject.useInput && replacement[key] == null && obj[key] == null)) ) {
      const injectableValue = context.injectableValues[jsonInject.value];
      if (propertySetter != null && typeof replacement[propertySetter] === 'function') {
        replacement[propertySetter](injectableValue);
      } else {
        replacement[key] = injectableValue;
      }
    }
  }

  /**
   *
   * @param replacement
   * @param obj
   * @param key
   * @param parent
   * @param context
   * @param globalContext
   */
  private parseJsonSetter(replacement: any, obj: any, key: string, parent: any, context: JsonParserTransformerContext,
                          globalContext: JsonParserGlobalContext) {
    const currentMainCreator = context.mainCreator[0];

    const jsonVirtualProperty: JsonPropertyOptions | JsonSetterOptions =
      this.cachedGetMetadata('JsonVirtualProperty:' + key, currentMainCreator, null, context);

    if (('access' in jsonVirtualProperty && jsonVirtualProperty.access !== JsonPropertyAccess.READ_ONLY) ||
      !('access' in jsonVirtualProperty)) {

      if ('required' in jsonVirtualProperty && jsonVirtualProperty.required &&
        !Object.hasOwnProperty.call(obj, jsonVirtualProperty._propertyKey)) {
        // eslint-disable-next-line max-len
        throw new JacksonError(`Required value "${jsonVirtualProperty.value}" not found for ${currentMainCreator.name}.${key} at [Source '${JSON.stringify(obj)}']`);
      }

      let parsedValue;
      if (typeof jsonVirtualProperty._descriptor.value === 'function') {
        parsedValue = this.parseCreatorProperties(key, null, obj, parent, context, globalContext, [jsonVirtualProperty.value], false)
          .props[0][1];
      } else {
        parsedValue = this.parseJsonClassType(context, globalContext, obj, key, parent);
      }

      if ('nulls' in jsonVirtualProperty || 'contentNulls' in jsonVirtualProperty) {
        if (jsonVirtualProperty.nulls !== JsonSetterNulls.SET && parsedValue == null) {
          switch (jsonVirtualProperty.nulls) {
          case JsonSetterNulls.FAIL:
            // eslint-disable-next-line max-len
            throw new JacksonError(`"${parsedValue}" value found on ${jsonVirtualProperty.value} for ${currentMainCreator.name}.${key} at [Source '${JSON.stringify(obj)}']`);
          case JsonSetterNulls.SKIP:
            return;
          }
        }
        if (jsonVirtualProperty.contentNulls !== JsonSetterNulls.SET) {
          if (isIterableNoMapNoString(parsedValue)) {
            parsedValue = [...parsedValue];
            const indexesToBeRemoved = [];
            for (let i = 0; i < parsedValue.length; i++) {
              const value = parsedValue[i];
              if (value == null) {
                switch (jsonVirtualProperty.contentNulls) {
                case JsonSetterNulls.FAIL:
                  // eslint-disable-next-line max-len
                  throw new JacksonError(`"${value}" value found on ${jsonVirtualProperty.value} at index ${i} for ${currentMainCreator.name}.${key} at [Source '${JSON.stringify(obj)}']`);
                case JsonSetterNulls.SKIP:
                  indexesToBeRemoved.push(i);
                  break;
                }
              }
            }
            while (indexesToBeRemoved.length) {
              parsedValue.splice(indexesToBeRemoved.pop(), 1);
            }
          } else if (parsedValue instanceof Map || (parsedValue != null && parsedValue.constructor === Object)) {
            const entries = (parsedValue instanceof Map) ?
              [...parsedValue.entries()] :
              Object.entries(parsedValue);
            for (const [mapKey, mapValue] of entries) {
              if (mapValue == null) {
                switch (jsonVirtualProperty.contentNulls) {
                case JsonSetterNulls.FAIL:
                  // eslint-disable-next-line max-len
                  throw new JacksonError(`"${mapValue}" value found on ${jsonVirtualProperty.value} at key "${mapKey}" for ${currentMainCreator.name}.${key} at [Source '${JSON.stringify(obj)}']`);
                case JsonSetterNulls.SKIP:
                  if (parsedValue instanceof Map) {
                    parsedValue.delete(mapKey);
                  } else {
                    delete parsedValue[mapKey];
                  }
                  break;
                }
              }
            }
          }
        }
      }

      if (typeof jsonVirtualProperty._descriptor.value === 'function') {
        replacement[key](parsedValue);
      } else {
        replacement[key] = parsedValue;
      }
    }
  }

  /**
   *
   * @param methodName
   * @param method
   * @param obj
   * @param parent
   * @param context
   * @param globalContext
   * @param propNames
   * @param isJsonCreator
   */
  private parseCreatorProperties(methodName: string,
                                 method: any,
                                 obj: any,
                                 parent: any,
                                 context: JsonParserTransformerContext,
                                 globalContext: JsonParserGlobalContext,
                                 propNames: string[],
                                 isJsonCreator: boolean): {
      props: [string, any][];
      propNamesAliasToBeExcluded: Array<string>;
    } {
    const currentMainCreator = context.mainCreator[0];
    const props: [string, any][] = [];

    if (context.features.deserialization.ACCEPT_CASE_INSENSITIVE_PROPERTIES) {
      const objKeys = Object.keys(obj);
      const caseInsesitiveObjKeys = objKeys.map((k) => k.toLowerCase());
      for (const propName of propNames) {
        const index = caseInsesitiveObjKeys.indexOf(propName.toLowerCase());
        if (index >= 0) {
          obj[propName] = obj[objKeys[index]];
          delete obj[objKeys[index]];
          objKeys[index] = propName;
        }
      }
    }

    propNames = mapVirtualPropertiesToClassProperties(currentMainCreator, propNames, context, {checkSetters: true});

    const propNamesAliasToBeExcluded = [];

    for (let propIndex = 0; propIndex < propNames.length; propIndex++) {
      const key = propNames[propIndex];

      const hasJsonIgnore =
        hasMetadata('JsonIgnoreParam:' + propIndex, currentMainCreator, methodName, context);
      if (hasJsonIgnore) {
        props.push([key, context.features.deserialization.MAP_UNDEFINED_TO_NULL ? null : undefined]);
      }

      const isIncludedByJsonView = this.parseIsIncludedByJsonViewParam(context, methodName, propIndex);
      if (!isIncludedByJsonView) {
        props.push([key, context.features.deserialization.MAP_UNDEFINED_TO_NULL ? null : undefined]);
        continue;
      }

      const jsonInject: JsonInjectOptions =
        this.cachedGetMetadata('JsonInjectParam:' + propIndex, currentMainCreator, methodName, context);

      if (!jsonInject || (jsonInject && jsonInject.useInput)) {
        const jsonProperty: JsonPropertyOptions =
          this.cachedGetMetadata('JsonPropertyParam:' + propIndex, currentMainCreator, methodName, context);

        let mappedKey: string = jsonProperty != null ? jsonProperty.value : null;
        if (!mappedKey) {
          const jsonAlias: JsonAliasOptions =
            this.cachedGetMetadata('JsonAliasParam:' + propIndex, currentMainCreator, methodName, context) as JsonAliasOptions;

          if (jsonAlias && jsonAlias.values) {
            mappedKey = jsonAlias.values.find((alias) => Object.hasOwnProperty.call(obj, alias));
          }
        }

        if (mappedKey && Object.hasOwnProperty.call(obj, mappedKey)) {
          props.push([key, this.parseJsonClassType(context, globalContext, obj, mappedKey, parent, methodName, propIndex)]);
          propNamesAliasToBeExcluded.push(mappedKey);
        } else if (mappedKey && jsonProperty.required) {
          // eslint-disable-next-line max-len
          throw new JacksonError(`Required property "${mappedKey}" not found on parameter at index ${propIndex} of ${currentMainCreator.name}.${methodName} at [Source '${JSON.stringify(obj)}']`);
        } else if (Object.hasOwnProperty.call(obj, key)) {
          props.push([key, this.parseJsonClassType(context, globalContext, obj, key, parent, methodName, propIndex)]);
        } else {
          if (isJsonCreator && context.features.deserialization.FAIL_ON_MISSING_CREATOR_PROPERTIES &&
            (!jsonInject || (jsonInject && !(jsonInject.value in context.injectableValues)))) {
            // eslint-disable-next-line max-len
            throw new JacksonError(`Missing @JsonCreator() parameter at index ${propIndex} of ${currentMainCreator.name}.${methodName} at [Source '${JSON.stringify(obj)}']`);
          }
          props.push([
            key,
            jsonInject ?
              context.injectableValues[jsonInject.value] :
              (context.features.deserialization.MAP_UNDEFINED_TO_NULL ? null : undefined)
          ]);
        }

      } else {
        // force argument value to use options.injectableValues
        props.push([key, jsonInject ? context.injectableValues[jsonInject.value] : undefined]);
      }
    }

    if (isJsonCreator && context.features.deserialization.FAIL_ON_NULL_CREATOR_PROPERTIES) {
      const propsLength = props.length;
      for (let i = 0; i < propsLength; i++) {
        const propValue = props[i][1];
        if (propValue == null) {
          // eslint-disable-next-line max-len
          throw new JacksonError(`Found "${propValue}" value on @JsonCreator() parameter at index ${i} of ${currentMainCreator.name}.${methodName} at [Source '${JSON.stringify(obj)}']`);
        }
      }
    }

    return {
      props,
      propNamesAliasToBeExcluded
    };
  }

  /**
   *
   * @param replacement
   * @param context
   */
  private parseJsonVirtualPropertyAndJsonAlias(replacement: any, context: JsonParserTransformerContext): void {
    const currentMainCreator = context.mainCreator[0];
    // convert JsonProperty to Class properties
    const creatorMetadataKeys = getMetadataKeys(currentMainCreator, context);

    for (const metadataKey of creatorMetadataKeys) {
      if (metadataKey.includes(':JsonVirtualProperty:') || metadataKey.includes(':JsonAlias:')) {

        const jsonVirtualProperty: JsonPropertyOptions | JsonSetterOptions =
          this.cachedGetMetadata(metadataKey, currentMainCreator, null, context);

        if (jsonVirtualProperty && jsonVirtualProperty._descriptor != null &&
          typeof jsonVirtualProperty._descriptor.value === 'function' &&
          jsonVirtualProperty._propertyKey.startsWith('get')) {
          continue;
        }

        // const realKey = metadataKey.split(/:JsonVirtualProperty:|:JsonAlias:/)[1];
        const realKey = metadataKey.split(':').pop();

        const isIgnored =
          jsonVirtualProperty && (jsonVirtualProperty as {access}).access === JsonPropertyAccess.READ_ONLY;
        if (!isIgnored) {
          if (jsonVirtualProperty) {
            if (Object.hasOwnProperty.call(replacement, jsonVirtualProperty.value)) {
              replacement[realKey] = replacement[jsonVirtualProperty.value];
              if (realKey !== jsonVirtualProperty.value) {
                delete replacement[jsonVirtualProperty.value];
              }
            } else if ((jsonVirtualProperty as {required}).required) {
              // eslint-disable-next-line max-len
              throw new JacksonError(`Required property "${jsonVirtualProperty.value}" not found at [Source '${JSON.stringify(replacement)}']`);
            }
            if ((jsonVirtualProperty as JsonAliasOptions).values) {
              for (const alias of (jsonVirtualProperty as JsonAliasOptions).values) {
                if (Object.hasOwnProperty.call(replacement, alias)) {
                  replacement[realKey] = replacement[alias];
                  if (realKey !== alias) {
                    delete replacement[alias];
                  }
                  break;
                }
              }
            }
          }
        } else {
          delete replacement[realKey];
        }
      }
    }
  }

  /**
   *
   * @param context
   * @param replacement
   * @param key
   */
  private parseJsonRawValue(context: JsonParserTransformerContext, replacement: any, key: string): void {
    const jsonRawValue =
      hasMetadata('JsonRawValue', context.mainCreator[0], key, context);
    if (jsonRawValue) {
      replacement[key] = JSON.stringify(replacement[key]);
    }
  }

  /**
   *
   * @param replacement
   * @param context
   */
  private parseJsonRootName(replacement: any, context: JsonParserTransformerContext): any {
    if (context.features.deserialization.UNWRAP_ROOT_VALUE) {
      const jsonRootName: JsonRootNameOptions =
        this.cachedGetMetadata('JsonRootName', context.mainCreator[0], null, context);
      const wrapKey = (jsonRootName && jsonRootName.value) ? jsonRootName.value : context.mainCreator[0].constructor.name;
      if (!(wrapKey in replacement) || Object.keys(replacement).length !== 1) {
        // eslint-disable-next-line max-len
        throw new JacksonError(`No JSON Object with single property as root name "${wrapKey}" found to unwrap value at [Source "${JSON.stringify(replacement)}"]`);
      }
      return clone(replacement[wrapKey]);
    }
    return replacement;
  }

  /**
   *
   * @param context
   * @param globalContext
   * @param obj
   * @param key
   * @param parent
   * @param methodName
   * @param argumentIndex
   */
  private parseJsonClassType(context: JsonParserTransformerContext, globalContext: JsonParserGlobalContext, obj: any, key: string,
                             parent: any, methodName?: string, argumentIndex?: number): any {
    let jsonClass: JsonClassTypeOptions;
    if (methodName != null && argumentIndex != null) {
      jsonClass =
        this.cachedGetMetadata('JsonClassTypeParam:' + argumentIndex, context.mainCreator[0], methodName, context) as JsonClassTypeOptions;
    }
    if (!jsonClass) {
      // if @JsonClass() is not found at parameter level, try to get it from the class properties
      jsonClass = this.cachedGetMetadata('JsonClassType', context.mainCreator[0], key, context) as JsonClassTypeOptions;
    }
    this.propagateDecorators(jsonClass, obj, key, context, methodName, argumentIndex);

    // BVER: was cloneDeep
    const newContext = clone(context);

    if (jsonClass && jsonClass.type) {
      newContext.mainCreator = jsonClass.type();
      this._addInternalDecoratorsFromJsonClass(newContext.mainCreator, newContext);
    } else {
      const newCreator = (obj[key] != null) ? obj[key].constructor : Object;
      newContext.mainCreator = [newCreator];
    }
    return this.deepTransform(key, obj[key], obj, newContext, globalContext);
  }

  /**
   *
   * @param mainCreator
   * @param context
   */
  private _addInternalDecoratorsFromJsonClass(mainCreator: any[], context: JsonParserTransformerContext) {
    for (let i = 0; i < mainCreator.length; i++) {
      const ctor = mainCreator[i];
      if (!(ctor instanceof Array)) {
        if (!ctor.name && typeof ctor === 'function') {
          const decoratorsToBeApplied = {
            depth: 1
          };
          const result = (ctor as ClassTypeWithDecoratorDefinitions)();
          mainCreator[i] = result.target;
          const decorators = result.decorators;
          for (const decorator of decorators) {
            const metadataKeysWithContext =
              makeMetadataKeysWithContext(decorator.name, {contextGroups: decorator.options.contextGroups});
            for (const metadataKeyWithContext of metadataKeysWithContext) {
              decoratorsToBeApplied[metadataKeyWithContext] = {
                enabled: true,
                ...decorator.options
              } as JsonDecoratorOptions;
            }
          }
          context._internalDecorators.set(result.target, decoratorsToBeApplied);
        }
      } else {
        this._addInternalDecoratorsFromJsonClass(ctor, context);
      }
    }
  }

  /**
   *
   * @param replacement
   * @param context
   * @param obj
   * @param key
   */
  private parseJsonManagedReference(replacement: any, context: JsonParserTransformerContext, obj: any, key: string): void {
    const currentMainCreator = context.mainCreator[0];

    let jsonManagedReference: JsonManagedReferenceOptions =
      this.cachedGetMetadata('JsonManagedReference', currentMainCreator, key, context);
    let jsonClassManagedReference: JsonClassTypeOptions =
      this.cachedGetMetadata('JsonClassType', currentMainCreator, key, context) as JsonClassTypeOptions;

    if (!jsonManagedReference) {
      const propertySetter = mapVirtualPropertyToClassProperty(currentMainCreator, key, context, {checkSetters: true});
      jsonManagedReference =
        this.cachedGetMetadata('JsonManagedReference', currentMainCreator, propertySetter, context);
      jsonClassManagedReference =
        this.cachedGetMetadata('JsonClassTypeParam:0', currentMainCreator, propertySetter, context) as JsonClassTypeOptions;

      if (jsonManagedReference && !jsonClassManagedReference) {
        // eslint-disable-next-line max-len
        throw new JacksonError(`Missing mandatory @JsonClass() decorator for the parameter at index 0 of @JsonManagedReference() decorated ${replacement.constructor.name}.${propertySetter}() method at [Source '${JSON.stringify(obj)}']`);
      }
    }

    if (jsonManagedReference && jsonClassManagedReference) {

      const jsonClassConstructors =  jsonClassManagedReference.type();
      const childConstructor = jsonClassConstructors[0];
      if (isClassIterable(childConstructor)) {
        const backReferenceConstructor = (jsonClassConstructors.length === 1) ?
          Object :
          (
            (!isSameConstructorOrExtensionOfNoObject(childConstructor, Map)) ?
              jsonClassManagedReference.type()[1][0] :
              jsonClassManagedReference.type()[1][1]
          );

        const jsonBackReference: JsonBackReferenceOptions =
          this.cachedGetMetadata('JsonBackReference:' + jsonManagedReference.value,
            backReferenceConstructor, null, context);

        if (jsonBackReference) {
          if (isSameConstructorOrExtensionOfNoObject(childConstructor, Map)) {
            for (const value of replacement[key][1]) {
              if (typeof value[jsonBackReference._propertyKey] === 'function') {
                value[jsonBackReference._propertyKey](replacement);
              } else {
                value[jsonBackReference._propertyKey] = replacement;
              }
            }
          } else {
            for (const value of replacement[key]) {
              if (typeof value[jsonBackReference._propertyKey] === 'function') {
                value[jsonBackReference._propertyKey](replacement);
              } else {
                value[jsonBackReference._propertyKey] = replacement;
              }
            }
          }
        }
      } else {
        const jsonBackReference: JsonBackReferenceOptions =
          this.cachedGetMetadata('JsonBackReference:' + jsonManagedReference.value,
            childConstructor, null, context);
        if (jsonBackReference) {
          if (typeof replacement[key][jsonBackReference._propertyKey] === 'function') {
            replacement[key][jsonBackReference._propertyKey](replacement);
          } else {
            replacement[key][jsonBackReference._propertyKey] = replacement;
          }
        }
      }
    } else if (jsonManagedReference && !jsonClassManagedReference) {
      // eslint-disable-next-line max-len
      throw new JacksonError(`Missing mandatory @JsonClass() decorator for the @JsonManagedReference() decorated ${replacement.constructor.name}["${key}"] field at [Source '${JSON.stringify(obj)}']`);
    }
  }

  /**
   *
   * @param replacement
   * @param obj
   * @param key
   * @param context
   */
  private parseJsonAnySetter(replacement: any, obj: any, key: string, context: JsonParserTransformerContext): void {
    const jsonAnySetter: JsonAnySetterOptions =
      this.cachedGetMetadata('JsonAnySetter', replacement.constructor, null, context);
    if (jsonAnySetter && replacement[jsonAnySetter._propertyKey]) {
      if (typeof replacement[jsonAnySetter._propertyKey] === 'function') {
        replacement[jsonAnySetter._propertyKey](key, obj[key]);
      } else {
        replacement[jsonAnySetter._propertyKey][key] = obj[key];
      }
    }
  }

  /**
   *
   * @param context
   * @param replacement
   */
  private parseJsonDeserializeClass(replacement: any, context: JsonParserTransformerContext): any {
    const jsonDeserialize: JsonDeserializeOptions =
      this.cachedGetMetadata('JsonDeserialize', context.mainCreator[0], null, context);
    if (jsonDeserialize && jsonDeserialize.using) {
      return jsonDeserialize.using(replacement, context);
    }
    return replacement;
  }

  /**
   *
   * @param context
   * @param replacement
   * @param key
   */
  private parseJsonDeserializeProperty(key: string, replacement: any, context: JsonParserTransformerContext): void {
    const currentMainCreator = context.mainCreator[0];

    const jsonDeserialize: JsonDeserializeOptions =
      this.cachedGetMetadata('JsonDeserialize', currentMainCreator, key, context);
    if (jsonDeserialize && jsonDeserialize.using) {
      replacement[key] = jsonDeserialize.using(replacement[key], context);
    }
  }

  /**
   *
   * @param context
   * @param key
   */
  private parseHasJsonIgnore(context: JsonParserTransformerContext, key: string): boolean {
    const currentMainCreator = context.mainCreator[0];
    const hasJsonIgnore =
      hasMetadata('JsonIgnore', currentMainCreator, key, context);

    if (!hasJsonIgnore) {
      const jsonIgnoreProperties: JsonIgnorePropertiesOptions =
        this.cachedGetMetadata('JsonIgnoreProperties', currentMainCreator, null, context);
      if (jsonIgnoreProperties) {
        const jsonVirtualProperty: JsonPropertyOptions | JsonGetterOptions =
          this.cachedGetMetadata('JsonVirtualProperty:' + key, currentMainCreator, null, context);

        if (jsonVirtualProperty && jsonIgnoreProperties.value.includes(jsonVirtualProperty.value)) {
          if (jsonVirtualProperty._descriptor != null && typeof jsonVirtualProperty._descriptor.value === 'function' &&
            jsonIgnoreProperties.allowSetters) {
            return false;
          }
          return true;
        }
        return jsonIgnoreProperties.value.includes(key);
      }
    }
    return hasJsonIgnore;
  }

  /**
   *
   * @param context
   */
  private parseJsonIgnoreType(context: JsonParserTransformerContext): boolean {
    return hasMetadata('JsonIgnoreType', context.mainCreator[0], null, context);
  }

  /**
   *
   * @param obj
   * @param parent
   * @param context
   */
  private parseJsonTypeInfo(obj: any, parent: any, context: JsonParserTransformerContext): any {
    const currentMainCreator = context.mainCreator[0];
    const jsonTypeInfo: JsonTypeInfoOptions =
      this.cachedGetMetadata('JsonTypeInfo', currentMainCreator, null, context) as JsonTypeInfoOptions;

    if (jsonTypeInfo) {
      let jsonTypeCtor: ClassType<any>;
      let jsonTypeInfoProperty: string;
      let newObj = clone(obj);

      switch (jsonTypeInfo.include) {
      case JsonTypeInfoAs.PROPERTY:
        jsonTypeInfoProperty = newObj[jsonTypeInfo.property];
        if (jsonTypeInfoProperty == null &&
          context.features.deserialization.FAIL_ON_MISSING_TYPE_ID && context.features.deserialization.FAIL_ON_INVALID_SUBTYPE) {
          // eslint-disable-next-line max-len
          throw new JacksonError(`Missing type id when trying to resolve type or subtype of class ${currentMainCreator.name}: missing type id property '${jsonTypeInfo.property}' at [Source '${JSON.stringify(newObj)}']`);
        } else {
          delete newObj[jsonTypeInfo.property];
        }
        break;
      case JsonTypeInfoAs.WRAPPER_OBJECT:
        if (!(newObj instanceof Object) || newObj instanceof Array) {
          // eslint-disable-next-line max-len
          throw new JacksonError(`Expected "Object", got "${newObj.constructor.name}": need JSON Object to contain JsonTypeInfoAs.WRAPPER_OBJECT type information for class "${currentMainCreator.name}" at [Source '${JSON.stringify(newObj)}']`);
        }
        jsonTypeInfoProperty = Object.keys(newObj)[0];
        newObj = newObj[jsonTypeInfoProperty];
        break;
      case JsonTypeInfoAs.WRAPPER_ARRAY:
        if (!(newObj instanceof Array)) {
          // eslint-disable-next-line max-len
          throw new JacksonError(`Expected "Array", got "${newObj.constructor.name}": need JSON Array to contain JsonTypeInfoAs.WRAPPER_ARRAY type information for class "${currentMainCreator.name}" at [Source '${JSON.stringify(newObj)}']`);
        } else if (newObj.length > 2 || newObj.length === 0) {
          // eslint-disable-next-line max-len
          throw new JacksonError(`Expected "Array" of length 1 or 2, got "Array" of length ${newObj.length}: need JSON Array of length 1 or 2 to contain JsonTypeInfoAs.WRAPPER_ARRAY type information for class "${currentMainCreator.name}" at [Source '${JSON.stringify(newObj)}']`);
        } else if (newObj[0] == null || newObj[0].constructor !== String) {
          // eslint-disable-next-line max-len
          throw new JacksonError(`Expected "String", got "${newObj[0] ? newObj[0].constructor.name : newObj[0]}": need JSON String that contains type id (for subtype of "${currentMainCreator.name}") at [Source '${JSON.stringify(newObj)}']`);
        }
        jsonTypeInfoProperty = newObj[0] as string;
        newObj = newObj[1];
        break;
      case JsonTypeInfoAs.EXTERNAL_PROPERTY:
        const srcObj = parent ?? newObj;
        jsonTypeInfoProperty = srcObj[jsonTypeInfo.property];
        if (jsonTypeInfoProperty == null &&
          context.features.deserialization.FAIL_ON_MISSING_TYPE_ID && context.features.deserialization.FAIL_ON_INVALID_SUBTYPE) {
          // eslint-disable-next-line max-len
          throw new JacksonError(`Missing type id when trying to resolve type or subtype of class ${currentMainCreator.name}: missing type id property '${jsonTypeInfo.property}' at [Source '${JSON.stringify(newObj)}']`);
        } else {
          delete srcObj[jsonTypeInfo.property];
        }
        break;
      }

      const jsonTypeIdResolver: JsonTypeIdResolverOptions =
        this.cachedGetMetadata('JsonTypeIdResolver', currentMainCreator, null, context) as JsonTypeIdResolverOptions;
      if (jsonTypeIdResolver && jsonTypeIdResolver.resolver) {
        jsonTypeCtor = jsonTypeIdResolver.resolver.typeFromId(jsonTypeInfoProperty, context);
      }

      const jsonSubTypes: JsonSubTypesOptions =
        this.cachedGetMetadata('JsonSubTypes', currentMainCreator, null, context) as JsonSubTypesOptions;

      if (!jsonTypeCtor && jsonTypeInfoProperty != null) {
        if (jsonSubTypes && jsonSubTypes.types && jsonSubTypes.types.length > 0) {
          for (const subType of jsonSubTypes.types) {
            const subTypeClass = subType.class() as ObjectConstructor;
            if ( (subType.name != null && jsonTypeInfoProperty === subType.name) ||
              jsonTypeInfoProperty === subTypeClass.name) {
              jsonTypeCtor = subTypeClass;
            }
          }
          if (!jsonTypeCtor && context.features.deserialization.FAIL_ON_INVALID_SUBTYPE) {
            const ids = [(currentMainCreator).name];
            ids.push(...jsonSubTypes.types.map((subType) => (subType.name) ? subType.name : subType.class().name));
            // eslint-disable-next-line max-len
            throw new JacksonError(`Could not resolve type id "${jsonTypeInfoProperty}" as a subtype of "${currentMainCreator.name}": known type ids = [${ids.join(', ')}] at [Source '${JSON.stringify(newObj)}']`);
          }
        }
      }

      if (!jsonTypeCtor) {
        switch (jsonTypeInfo.use) {
        case JsonTypeInfoId.NAME:
          if (jsonTypeInfoProperty != null && jsonTypeInfoProperty === currentMainCreator.name) {
            jsonTypeCtor = currentMainCreator;
          }
          break;
        }
      }

      if (!jsonTypeCtor && context.features.deserialization.FAIL_ON_INVALID_SUBTYPE && jsonTypeInfoProperty != null) {
        const ids = [(currentMainCreator).name];
        if (jsonSubTypes && jsonSubTypes.types && jsonSubTypes.types.length > 0) {
          ids.push(...jsonSubTypes.types.map((subType) => (subType.name) ? subType.name : subType.class().name));
        }
        // eslint-disable-next-line max-len
        throw new JacksonError(`Could not resolve type id "${jsonTypeInfoProperty}" as a subtype of "${currentMainCreator.name}": known type ids = [${ids.join(', ')}] at [Source '${JSON.stringify(newObj)}']`);
      } else if (!jsonTypeCtor) {
        jsonTypeCtor = currentMainCreator;
      }

      context.mainCreator = [jsonTypeCtor];
      return newObj;
    }

    return obj;
  }

  /**
   *
   * @param context
   * @param key
   */
  private parseIsIncludedByJsonViewProperty(context: JsonParserTransformerContext, key: string): boolean {
    const currentMainCreator = context.mainCreator[0];

    if (context.withViews) {
      let jsonView: JsonViewOptions =
        this.cachedGetMetadata('JsonView', currentMainCreator, key, context) as JsonViewOptions;
      if (!jsonView) {
        jsonView = this.cachedGetMetadata('JsonView', currentMainCreator, null, context) as JsonViewOptions;
      }

      if (jsonView && jsonView.value) {
        return this.parseIsIncludedByJsonView(jsonView, context);
      }

      return context.features.deserialization.DEFAULT_VIEW_INCLUSION;
    }
    return true;
  }

  /**
   *
   * @param context
   * @param methodName
   * @param argumentIndex
   */
  private parseIsIncludedByJsonViewParam(context: JsonParserTransformerContext, methodName: string, argumentIndex: number): boolean {
    const currentMainCreator = context.mainCreator[0];

    if (context.withViews) {
      const jsonView: JsonViewOptions =
        this.cachedGetMetadata('JsonViewParam:' + argumentIndex, currentMainCreator, methodName, context) as JsonViewOptions;

      if (jsonView && jsonView.value) {
        return this.parseIsIncludedByJsonView(jsonView, context);
      }

      return context.features.deserialization.DEFAULT_VIEW_INCLUSION;
    }
    return true;
  }

  /**
   *
   * @param jsonView
   * @param context
   */
  private parseIsIncludedByJsonView(jsonView: JsonViewOptions, context: JsonParserTransformerContext): boolean {
    const views = jsonView.value();
    const withViews = context.withViews();
    for (const view of views) {
      for (const withView of withViews) {
        if (isSameConstructorOrExtensionOf(view, withView)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   *
   * @param replacement
   * @param context
   */
  private parseJsonUnwrapped(replacement: any, context: JsonParserTransformerContext): void {
    const currentMainCreator = context.mainCreator[0];
    const metadataKeys: string[] = getMetadataKeys(currentMainCreator, context);
    for (const metadataKey of metadataKeys) {
      if (metadataKey.includes(':JsonUnwrapped:')) {
        const realKey = metadataKey.split(':').pop();

        const jsonUnwrapped: JsonUnwrappedOptions =
          this.cachedGetMetadata(metadataKey, currentMainCreator, null, context);
        if (jsonUnwrapped._descriptor != null &&
          typeof jsonUnwrapped._descriptor.value === 'function' &&
          !realKey.startsWith('set')) {
          continue;
        }

        const jsonClass: JsonClassTypeOptions =
          this.cachedGetMetadata('JsonClassType', currentMainCreator, realKey, context) as JsonClassTypeOptions;
        if (!jsonClass) {
          // eslint-disable-next-line max-len
          throw new JacksonError(`@JsonUnwrapped() requires use of @JsonClass() for deserialization at ${currentMainCreator.name}["${realKey}"])`);
        }

        const prefix = (jsonUnwrapped.prefix != null) ? jsonUnwrapped.prefix : '';
        const suffix = (jsonUnwrapped.suffix != null) ? jsonUnwrapped.suffix : '';

        replacement[realKey] = {};

        const properties = getClassProperties(jsonClass.type()[0], null, context, {
          withJsonVirtualPropertyValues: true,
          withJsonAliases: true
        });
        for (const k of properties) {
          const wrappedKey = prefix + k + suffix;
          if (Object.hasOwnProperty.call(replacement, wrappedKey)) {
            replacement[realKey][k] = replacement[wrappedKey];
            delete replacement[wrappedKey];
          }
        }
      }
    }
  }

  /**
   *
   * @param replacement
   * @param obj
   * @param context
   * @param globalContext
   */
  private parseJsonIdentityInfo(replacement: any, obj: any, context: JsonParserTransformerContext,
                                globalContext: JsonParserGlobalContext): void {
    const jsonIdentityInfo: JsonIdentityInfoOptions =
      this.cachedGetMetadata('JsonIdentityInfo', context.mainCreator[0], null, context) as JsonIdentityInfoOptions;

    if (jsonIdentityInfo) {
      const id: string = obj[jsonIdentityInfo.property];
      const scope: string = jsonIdentityInfo.scope || '';
      const scopedId = this.generateScopedId(scope, id);
      if (!globalContext.globalValueAlreadySeen.has(scopedId)) {
        globalContext.globalValueAlreadySeen.set(scopedId, replacement);
      }

      delete obj[jsonIdentityInfo.property];
    }
  }

  /**
   *
   * @param iterable
   * @param key
   * @param context
   * @param globalContext
   */
  private parseIterable(iterable: any, key: string, context: JsonParserTransformerContext,
                        globalContext: JsonParserGlobalContext): any {
    const jsonDeserialize: JsonDeserializeOptions =
      this.cachedGetMetadata('JsonDeserialize',
        context._propertyParentCreator,
        key, context);

    const currentCreators = context.mainCreator;
    const currentCreator = currentCreators[0];

    let newIterable: any;
    // BVER was cloneDeep
    const newContext = clone(context);

    if (currentCreators.length > 1 && currentCreators[1] instanceof Array) {
      newContext.mainCreator = currentCreators[1] as [ClassType<any>];
    } else {
      newContext.mainCreator = [Object];
    }

    if (isSameConstructorOrExtensionOfNoObject(currentCreator, Set)) {
      if (isSameConstructor(currentCreator, Set)) {
        newIterable = new Set();
      } else {
        newIterable = new (currentCreator as ObjectConstructor)() as Set<any>;
      }
      for (let value of iterable) {
        if (newContext.mainCreator == null) {
          newContext.mainCreator = [(value != null) ? value.constructor : Object];
        }

        if (jsonDeserialize && jsonDeserialize.contentUsing) {
          value = jsonDeserialize.contentUsing(value, newContext);
        }

        if (this.parseJsonIgnoreType(newContext)) {
          continue;
        }

        (newIterable as Set<any>).add(this.deepTransform(key, value, iterable, newContext, globalContext));
      }
    } else {
      newIterable = [];
      for (let value of iterable) {
        if (newContext.mainCreator == null) {
          newContext.mainCreator = [(value != null) ? value.constructor : Object];
        }

        if (jsonDeserialize && jsonDeserialize.contentUsing) {
          value = jsonDeserialize.contentUsing(value, newContext);
        }

        if (this.parseJsonIgnoreType(newContext)) {
          continue;
        }

        (newIterable as Array<any>).push(this.deepTransform(key, value, undefined, newContext, globalContext));
      }
      if (!isSameConstructor(currentCreator, Array)) {
        // @ts-ignore
        newIterable = new currentCreator(...newIterable);
      }
    }

    return newIterable;
  }

  /**
   *
   * @param key
   * @param obj
   * @param context
   * @param globalContext
   */
  private parseMapAndObjLiteral(key: string, obj: any, context: JsonParserTransformerContext,
                                globalContext: JsonParserGlobalContext): Map<any, any> | Record<any, any> {
    const currentCreators = context.mainCreator;
    const currentCreator = currentCreators[0];

    const jsonDeserialize: JsonDeserializeOptions =
      this.cachedGetMetadata('JsonDeserialize', context._propertyParentCreator, key, context);

    let map: Map<any, any> | Record<any, any>;

    // BVER was cloneDeep
    const newContext = clone(context);
    if (currentCreators.length > 1 && currentCreators[1] instanceof Array) {
      newContext.mainCreator = currentCreators[1] as [ClassType<any>];
    } else {
      newContext.mainCreator = [Object];
    }

    if (isSameConstructorOrExtensionOfNoObject(currentCreator, Map)) {
      map = new (currentCreator as ObjectConstructor)() as Map<any, any>;
    } else {
      map = {};
    }

    const mapCurrentCreators = newContext.mainCreator;

    const mapKeys = Object.keys(obj);
    for (let mapKey of mapKeys) {
      let mapValue = obj[mapKey];

      // BVER was cloneDeep
      const keyNewContext = clone(newContext);
      // BVER was cloneDeep
      const valueNewContext = clone(newContext);

      if (mapCurrentCreators[0] instanceof Array) {
        keyNewContext.mainCreator = mapCurrentCreators[0] as [ClassType<any>];
      } else {
        keyNewContext.mainCreator = [mapCurrentCreators[0]] as [ClassType<any>];
      }
      if (keyNewContext.mainCreator[0] === Object) {
        keyNewContext.mainCreator[0] = mapKey.constructor;
      }

      if (mapCurrentCreators.length > 1) {
        if (mapCurrentCreators[1] instanceof Array) {
          valueNewContext.mainCreator = mapCurrentCreators[1] as [ClassType<any>];
        } else {
          valueNewContext.mainCreator = [mapCurrentCreators[1]] as [ClassType<any>];
        }
      } else {
        valueNewContext.mainCreator = [Object];
      }
      if (mapValue != null && mapValue.constructor !== Object && valueNewContext.mainCreator[0] === Object) {
        valueNewContext.mainCreator[0] = mapValue.constructor;
      }

      if (jsonDeserialize && (jsonDeserialize.contentUsing || jsonDeserialize.keyUsing)) {
        mapKey = (jsonDeserialize.keyUsing) ? jsonDeserialize.keyUsing(mapKey, keyNewContext) : mapKey;
        mapValue = (jsonDeserialize.contentUsing) ?
          jsonDeserialize.contentUsing(mapValue, valueNewContext) : mapValue;

        if (mapKey != null && mapKey.constructor !== Object) {
          keyNewContext.mainCreator[0] = mapKey.constructor;
        }
        if (mapValue != null && mapValue.constructor !== Object) {
          valueNewContext.mainCreator[0] = mapValue.constructor;
        }
      }

      const mapKeyParsed = this.deepTransform('', mapKey, undefined, keyNewContext, globalContext);
      const mapValueParsed = this.deepTransform(mapKey, mapValue, map, valueNewContext, globalContext);
      if (map instanceof Map) {
        map.set(mapKeyParsed, mapValueParsed);
      } else {
        map[mapKeyParsed] = mapValueParsed;
      }
    }

    return map;
  }

  /**
   *
   * @param obj
   * @param context
   */
  private parseJsonNaming(obj: any, context: JsonParserTransformerContext): void {
    const jsonNamingOptions: JsonNamingOptions =
      this.cachedGetMetadata('JsonNaming', context.mainCreator[0], null, context)as JsonNamingOptions;
    if (jsonNamingOptions && jsonNamingOptions.strategy != null) {
      const keys = Object.keys(obj);
      const classProperties = new Set<string>(getClassProperties(context.mainCreator[0], null, context, {
        withSetterVirtualProperties: true
      }));

      const keysLength = keys.length;
      for (let i = 0; i < keysLength; i++) {
        const key = keys[i];
        let oldKey = key;
        switch (jsonNamingOptions.strategy) {
        case PropertyNamingStrategy.KEBAB_CASE:
          oldKey = key.replace(/-/g, '');
          break;
        case PropertyNamingStrategy.LOWER_DOT_CASE:
          oldKey = key.replace(/\./g, '');
          break;
        case PropertyNamingStrategy.LOWER_CAMEL_CASE:
        case PropertyNamingStrategy.LOWER_CASE:
        case PropertyNamingStrategy.UPPER_CAMEL_CASE:
          break;
        }

        let propertyFound = false;
        classProperties.forEach((propertyKey) => {
          if (propertyKey.toLowerCase() === oldKey.toLowerCase()) {
            oldKey = propertyKey;
            propertyFound = true;
            return;
          }
        });
        if (!propertyFound && jsonNamingOptions.strategy === PropertyNamingStrategy.SNAKE_CASE) {
          classProperties.forEach((propertyKey) => {
            const tokens = propertyKey.split(/(?=[A-Z])/);
            const tokensLength = tokens.length;
            let reconstructedKey  = '';
            for (let j = 0; j < tokensLength; j++) {
              const token = tokens[j].toLowerCase();
              const separator = (j > 0 && tokens[j - 1].endsWith('_')) ? '' : '_';
              reconstructedKey += (reconstructedKey !== '' && token.length > 1) ? separator + token : token;
            }
            if (key === reconstructedKey) {
              oldKey = propertyKey;
              return;
            }
          });
        }

        classProperties.delete(oldKey);

        if (oldKey != null && oldKey !== key) {
          oldKey = mapVirtualPropertyToClassProperty(context.mainCreator[0], oldKey, context, {checkSetters: true});
          obj[oldKey] = obj[key];
          delete obj[key];
        }
      }
    }
  }

  /**
   *
   * @param scope
   * @param id
   */
  private generateScopedId(scope: string, id: string): string {
    return scope + ': ' + id;
  }
}
