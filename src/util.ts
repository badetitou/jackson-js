import { parseScript } from 'meriyah';
import {
  ClassDeclaration,
  MethodDefinition,
  ExpressionStatement,
  FunctionDeclaration,
  FunctionExpression,
  Node
} from 'estree';
import {
  ClassType, CustomMapper, JsonAliasOptions,
  JsonDecorator,
  JsonDecoratorOptions, JsonGetterOptions, JsonPropertyOptions, JsonSetterOptions,
  JsonStringifierParserCommonContext,
} from './@types';
import 'reflect-metadata';
import {
  JacksonError
} from './core/JacksonError';
import {
  DefaultContextGroup
} from './core/DefaultContextGroup';

/**
 * Flag for testing if BigInt is supported
 */
export const hasBigInt = typeof BigInt !== 'undefined';

/**
 * @internal
 */
export interface MakeMetadataKeyWithContextOptions {
  prefix?: string;
  suffix?: string;
  contextGroup?: string;
}

/**
 * @internal
 */
export const makeMetadataKeyWithContext = (key: string, options: MakeMetadataKeyWithContextOptions = {}): string => {
  const regExp = /^[\w]+$/;
  if (options.contextGroup != null && !regExp.test(options.contextGroup)) {
    // eslint-disable-next-line max-len
    throw new JacksonError(`Invalid context group name "${options.contextGroup}" found! The context group name must match "/^[\\w]+$/" regular expression, that is a non-empty string which contains any alphanumeric character including the underscore.`);
  }

  return 'jackson:' +
    (options.contextGroup != null ? options.contextGroup : DefaultContextGroup) + ':' +
    (options.prefix != null ? options.prefix + ':' : '') +
    key +
    (options.suffix != null ? ':' + options.suffix : '');
};

/**
 * @internal
 */
export interface MakeMetadataKeysWithContextOptions {
  prefix?: string;
  suffix?: string;
  contextGroups?: string[];
}

/**
 * @internal
 */
export const makeMetadataKeysWithContext = (key: string, options: MakeMetadataKeysWithContextOptions): string[] =>
  (options.contextGroups != null && options.contextGroups.length > 0) ? options.contextGroups.map((contextGroup) =>
    makeMetadataKeyWithContext(key, {prefix: options.prefix, suffix: options.suffix, contextGroup})
  ) : [makeMetadataKeyWithContext(key, {prefix: options.prefix, suffix: options.suffix, contextGroup: null})];

/**
 * @internal
 */
export interface DefineMetadataOptions {
  prefix?: string;
  suffix?: string;
}

/**
 * @internal
 */
export const defineMetadata =
  (metadataKey: any, metadataValue: JsonDecoratorOptions, target: Record<string, any>, propertyKey: string | symbol = null,
   options: DefineMetadataOptions = {}) => {
    const makeMetadataKeysWithContextOptions: MakeMetadataKeysWithContextOptions = {
      contextGroups: metadataValue.contextGroups,
      ...options
    };

    makeMetadataKeysWithContext(metadataKey, makeMetadataKeysWithContextOptions).forEach((metadataKeyWithContext) => {
      if (propertyKey == null) {
        Reflect.defineMetadata(metadataKeyWithContext, metadataValue, target);
      } else {
        Reflect.defineMetadata(metadataKeyWithContext, metadataValue, target, propertyKey);
      }
    });
  };

/**
 * https://stackoverflow.com/a/43197340/4637638
 * @internal
 */
export const isClass = (obj): boolean => {
  const isCtorClass = obj.constructor
    && obj.constructor.toString().substring(0, 5) === 'class';

  if (obj.prototype === undefined) {
    return isCtorClass || !isFunction(obj);
  }
  const isPrototypeCtorClass = obj.prototype.constructor
    && obj.prototype.constructor.toString
    && obj.prototype.constructor.toString().substring(0, 5) === 'class';
  return isCtorClass || isPrototypeCtorClass || !isFunction(obj);
};

/**
 * https://stackoverflow.com/a/56035104/4637638
 * @internal
 */
export const isFunction = (funcOrClass: any): boolean => {
  const propertyNames = Object.getOwnPropertyNames(funcOrClass);
  return (!propertyNames.includes('prototype') || propertyNames.includes('arguments'));
};

/**
 * @internal
 */
export const makeDecorator = <T>(
  options: (...args: any[]) => JsonDecoratorOptions,
  decorator: JsonDecorator): any => {
  const DecoratorFactory = (...args: any[]): any => {
    const target: Record<string, any> = args[0];
    const propertyKey: null | string | symbol = args[1];
    const descriptorOrParamIndex: null | number | TypedPropertyDescriptor<any> = args[2];

    if ((typeof target === 'function' || propertyKey != null || descriptorOrParamIndex != null) ||
      descriptorOrParamIndex != null && typeof descriptorOrParamIndex === 'number') {
      return decorator(options(), target, propertyKey, descriptorOrParamIndex);
    } else {
      return <T>(targetDecorator: Record<string, any>,
        propertyKeyDecorator?: string | symbol,
        descriptor?: TypedPropertyDescriptor<T>): any =>
        decorator(options(args[0]), targetDecorator, propertyKeyDecorator, descriptor);
    }
  };
  return DecoratorFactory;
};

/**
 * @internal
 */
export const makeJacksonDecorator = <T>(
  options: (...args: any[]) => JsonDecoratorOptions,
  decorator: JsonDecorator): any => makeDecorator<T>(
  options,
  (o: JsonDecoratorOptions, target, propertyKey, descriptorOrParamIndex) => {

    if (propertyKey != null) {
      o._propertyKey = propertyKey.toString();
    }
    if (descriptorOrParamIndex != null && typeof descriptorOrParamIndex !== 'number') {
      o._descriptor = descriptorOrParamIndex;
    }

    const value = decorator(o, target, propertyKey, descriptorOrParamIndex);
    if (value != null) {
      return value;
    }
    if (typeof descriptorOrParamIndex !== 'number') {
      return descriptorOrParamIndex;
    }
  });

/**
 * https://github.com/rphansen91/es-arguments/blob/master/src/arguments.js#L3
 * @internal
 */
const pluckPattern = (pattern): string => ['{',
  pattern.map(({ key }) => key.name).join(', '),
  '}'].join(' ');

/**
 * https://github.com/rphansen91/es-arguments/blob/master/src/arguments.js#L9
 * @internal
 */
const pluckParamName = (param): string => {
  if (param.name) {return param.name; }
  if (param.left) {return pluckParamName(param.left); }
  if (param.properties) {return pluckPattern(param.properties); }
  if (param.type === 'RestElement') {return '...' + pluckParamName(param.argument); }
  return;
};

const nativeCodeRegex = /{\s*\[native code]\s*}$/;

/**
 * Determines if the provided function is implemented in native code.
 *
 * @param value
 * @internal
 */
export const isNativeCode = (value: Function | string): boolean => !!nativeCodeRegex.exec(value.toString());

/**
 * @internal
 */
export interface GetClassPropertiesOptions {
  /**
   * Class properties with Getters method/property name.
   *
   * If {@link withGetterVirtualProperties} is `false`, then the
   * property the Getter is referencing will be deleted from the
   * Class properties.
   */
  withGettersAsProperty?: boolean;
  withGetterVirtualProperties?: boolean;
  /**
   * Class properties with Setters method/property name.
   *
   * If {@link withSetterVirtualProperties} is `false`, then the
   * property the Setter is referencing will be deleted from the
   * Class properties.
   */
  withSettersAsProperty?: boolean;
  withSetterVirtualProperties?: boolean;
  withJsonVirtualPropertyValues?: boolean;
  withJsonAliases?: boolean;
}

/**
 * @internal
 */
const alreadyMappedClassProperties: WeakMap<Record<string, any>, Array<any>> = new WeakMap();

/**
 * @internal
 */
export const getClassProperties = (target: Record<string, any>, obj: any = null, context: JsonStringifierParserCommonContext<any>,
                                   options: GetClassPropertiesOptions = {}): string[] => {

  const objDefinition = obj ? Object.keys(obj).join(',') : 'null';
  const map1 = alreadyMappedClassProperties.get(target);
  if (typeof map1 !== 'undefined' && map1[objDefinition] !== undefined)  {
    return map1[objDefinition];
  }

  options = {
    withGettersAsProperty: false,
    withGetterVirtualProperties: false,
    withSettersAsProperty: false,
    withSetterVirtualProperties: false,
    withJsonVirtualPropertyValues: false,
    withJsonAliases: false,
    ...options
  };

  const contextGroupsWithDefault = [
    ...(context.withContextGroups  || []),
    DefaultContextGroup
  ];

  let objKeys = [];
  if (obj != null) {
    objKeys = Object.keys(obj);
    const constructorIndex = objKeys.indexOf('constructor');
    if (constructorIndex !== -1 &&
      typeof obj.constructor === 'function' &&
      !isNativeCode(obj.constructor) &&
      isNativeCode(obj.constructor.constructor)) {
      objKeys.splice(constructorIndex, 1);
    }
  }

  const keysToBeDeleted = new Set<string>();
  const metadataKeys = cachedReflectGetMetadataKeys(target);
  const classProperties: Set<string> = new Set(objKeys);

  for (const metadataKey of metadataKeys) {
    if (metadataKey.startsWith('jackson:')) {
      const isJsonVirtualProperty = metadataKey.includes(':JsonVirtualProperty:');

      if (isJsonVirtualProperty) {
        // Check if I should continue
        const metadataKeyFoundInContext =
          isMetadataKeyFoundInContext(metadataKey, 'JsonVirtualProperty', contextGroupsWithDefault);
        if (!metadataKeyFoundInContext) {
          continue;
        }
        // Normal behavior
        const jsonVirtualProperty: JsonPropertyOptions | JsonGetterOptions | JsonSetterOptions =
          cachedReflectGetMetadataKeyForTarget(metadataKey, target);

        if (jsonVirtualProperty && jsonVirtualProperty._descriptor != null
            && typeof jsonVirtualProperty._descriptor.value === 'function') {
          if (jsonVirtualProperty._propertyKey.startsWith('get')) {
            if (options.withGetterVirtualProperties) {
              classProperties.add(jsonVirtualProperty.value);
            }
            if (!options.withGettersAsProperty) {
              continue;
            } else if (!options.withGetterVirtualProperties) {
              keysToBeDeleted.add(jsonVirtualProperty.value);
            }
          }
          if (jsonVirtualProperty._propertyKey.startsWith('set')) {
            if (options.withSetterVirtualProperties) {
              classProperties.add(jsonVirtualProperty.value);
            }
            if (!options.withSettersAsProperty) {
              continue;
            } else if (!options.withSetterVirtualProperties) {
              keysToBeDeleted.add(jsonVirtualProperty.value);
            }
          }
        }
        classProperties.add(jsonVirtualProperty._propertyKey);
        if (options.withJsonVirtualPropertyValues && jsonVirtualProperty.value != null) {
          classProperties.add(jsonVirtualProperty.value);
        }
      } else if (metadataKey.includes(':JsonAlias:') && options.withJsonAliases) {
        const metadataKeyFoundInContext = isMetadataKeyFoundInContext(metadataKey, 'JsonAlias', contextGroupsWithDefault);
        if (!metadataKeyFoundInContext) {
          continue;
        }
        const suffix = metadataKey.split(':').pop();
        classProperties.add(suffix);
        const jsonAlias: JsonAliasOptions = cachedReflectGetMetadataKeyForTarget(metadataKey, target);
        if (jsonAlias.values != null) {
          for (const alias of jsonAlias.values) {
            classProperties.add(alias);
          }
        }
      }

    }
  }

  let parent = target;
  while (parent.name && parent !== Object) {
    const propertyDescriptors = Object.getOwnPropertyDescriptors(parent.prototype);
    // eslint-disable-next-line guard-for-in
    for (const property in propertyDescriptors) {
      const propertyDescriptor = propertyDescriptors[property];
      if (propertyDescriptor.get != null || propertyDescriptor.set != null) {
        classProperties.add(property);
      }
    }
    parent = Object.getPrototypeOf(parent);
  }

  keysToBeDeleted.forEach((key) => classProperties.delete(key));

  if (typeof map1 === 'undefined') {
    alreadyMappedClassProperties.set(target, []);
  }
  return alreadyMappedClassProperties.get(target)[objDefinition] = [...classProperties];
};

const isMetadataKeyFoundInContext = (metadataKey: any, property: string, contextGroupsWithDefault) => {

  const suffix = metadataKey.split(':').pop();
  for (const contextGroup of contextGroupsWithDefault) {
    const metadataKeyWithContext = makeMetadataKeyWithContext(
      property, {
        contextGroup,
        suffix
      });
    if (metadataKeyWithContext === metadataKey) {
      return true;
    }
  }
  return false;
};

/**
 * @internal
 */
export const classHasOwnProperty = (target: Record<string, any>, propertyKey: string, obj: any,
                                    context: JsonStringifierParserCommonContext<any>,
                                    options?: GetClassPropertiesOptions): boolean => {
  const classProperties = getClassProperties(target, obj, context, options);
  return classProperties.includes(propertyKey);
};

/**
 * @internal
 */
export interface VirtualPropertiesToClassPropertiesMappingOptions {
  checkGetters?: boolean;
  checkSetters?: boolean;
}

/**
 * @internal
 */
export const mapVirtualPropertiesToClassProperties =
  (target: Record<string, any>, keys: string[], context: JsonStringifierParserCommonContext<any>,
   options: VirtualPropertiesToClassPropertiesMappingOptions): string[] =>
    [...virtualPropertiesToClassPropertiesMapping(target, keys, context, options).values()];


/**
 * @internal
 */
export const virtualPropertiesToClassPropertiesMapping =
  (target: Record<string, any>, keys: string[], context: JsonStringifierParserCommonContext<any>,
   options: VirtualPropertiesToClassPropertiesMappingOptions): Set<string> => {
    const returnedSet = new Set<string>();
    for (const key of keys) {
      internVirtualPropertyToClassPropertiesMapping(target, key, context, options).forEach((el) => returnedSet.add(el));
    }
    return returnedSet;
  };


/**
 * @internal
 */
const alreadyMappedType: WeakMap<Record<string, any>, Map<string, Set<string>>> = new WeakMap();

/**
 * @internal
 */
export const internVirtualPropertyToClassPropertiesMapping =
  (target: Record<string, any>, key: string, context: JsonStringifierParserCommonContext<any>,
   options: VirtualPropertiesToClassPropertiesMappingOptions): Set<string> => {

    if (alreadyMappedType.get(target) !== undefined && alreadyMappedType.get(target).has(key)) {
      return alreadyMappedType.get(target).get(key);
    }

    const { checkGetters = false, checkSetters = false } = options;

    const contextGroupsWithDefault = (context.withContextGroups || []).concat(DefaultContextGroup);
    const metadataKeys = cachedReflectGetMetadataKeys(target);
    const propertiesMapping: Set<string> = new Set();

    let getterOrSetterFound = false;
    for (const metadataKey of metadataKeys) {

      if (metadataKey.startsWith('jackson:')) {
        const suffixStartIndex = metadataKey.lastIndexOf(':JsonVirtualProperty:');
        if ( suffixStartIndex !== -1) {
          const suffix = metadataKey.substring(suffixStartIndex + 21);
          const metadataKeyFoundInContext = contextGroupsWithDefault.some(contextGroup => {
            const metadataKeyWithContext = makeMetadataKeyWithContext('JsonVirtualProperty', {
              contextGroup,
              suffix
            });
            return metadataKeyWithContext === metadataKey;
          });

          if (!metadataKeyFoundInContext) {
            continue;
          }

          const jsonVirtualProperty: JsonPropertyOptions | JsonGetterOptions | JsonSetterOptions =
            cachedReflectGetMetadataKeyForTarget(metadataKey, target);

          if (jsonVirtualProperty && jsonVirtualProperty.value === key && jsonVirtualProperty._descriptor != null &&
            typeof jsonVirtualProperty._descriptor.value === 'function') {
            if ((checkGetters && jsonVirtualProperty._propertyKey.startsWith('get')) ||
              (checkSetters && jsonVirtualProperty._propertyKey.startsWith('set'))) {
              propertiesMapping.add(jsonVirtualProperty._propertyKey);
              getterOrSetterFound = true;
              break;
            }
          }
        }
      }
    }
    if (!getterOrSetterFound) {
      propertiesMapping.add(key);
    }

    if (alreadyMappedType.get(target) === undefined) {
      alreadyMappedType.set(target, new Map<string, Set<string>>());
    }
    alreadyMappedType.get(target).set(key, propertiesMapping);

    return propertiesMapping;
  };


/**
 * @internal
 */
export const mapVirtualPropertyToClassProperty =
  (target: Record<string, any>, key: string, context: JsonStringifierParserCommonContext<any>,
   options: VirtualPropertiesToClassPropertiesMappingOptions): string =>
    internVirtualPropertyToClassPropertiesMapping(target, key, context, options).values().next().value;

/**
 * @internal
 */
export const mapClassPropertiesToVirtualProperties =
  (target: Record<string, any>, classProperties: string[], context: JsonStringifierParserCommonContext<any>): string[] =>
    [...classPropertiesToVirtualPropertiesMapping(target, classProperties, context).values()];

/**
 * @internal
 */
export const classPropertiesToVirtualPropertiesMapping =
  (target: Record<string, any>, classProperties: string[], context: JsonStringifierParserCommonContext<any>): Map<string, string> => {

    const contextGroupsWithDefault = [
      ...(context.withContextGroups ? context.withContextGroups : []),
      DefaultContextGroup
    ];
    const propertiesMapping: Map<string, string> = new Map();

    for (const classProperty of classProperties) {
      let jsonVirtualProperty: JsonPropertyOptions | JsonGetterOptions | JsonSetterOptions = null;

      for (const contextGroup of contextGroupsWithDefault) {
        const metadataKeyWithContext = makeMetadataKeyWithContext('JsonVirtualProperty', {
          contextGroup,
          suffix: classProperty
        });
        jsonVirtualProperty = Reflect.getMetadata(metadataKeyWithContext, target);
        if (jsonVirtualProperty != null) {
          break;
        }
      }

      if (jsonVirtualProperty) {
        propertiesMapping.set(classProperty, jsonVirtualProperty.value);
      } else {
        propertiesMapping.set(classProperty, classProperty);
      }
    }
    return propertiesMapping;
  };

/**
 * @internal
 */
export const mapClassPropertyToVirtualProperty =
  (target: Record<string, any>, key: string, context: JsonStringifierParserCommonContext<any>): string =>
    mapClassPropertiesToVirtualProperties(target, [key], context)[0];

/**
 * @internal
 */
export const getArgumentNames = (method): string[] => {
  let code = method.toString().trim();

  if (isNativeCode(code)) {
    return [];
  }

  if (/^class({| extends)/.test(code)) {
    code = 'class JacksonClass ' + code.substring(5);
  } else if (/^function\s?\(/.test(code)) {
    code = 'function JacksonFunction ' + code.substring(9);
  } else if (!/^class\s?/.test(code) && !/^function\s?/.test(code)) {
    code = 'function ' + code;
  }

  const ast = parseScript(code, {
    next: true,
    webcompat: true,
    directives: true
  });
  const body = ast.body;

  let nodes: Node[] = [];
  if (code.startsWith('class ')) {
    const classDeclarationNodes = (body[0] as ClassDeclaration).body.body;
    // find constructor
    for (const propertyOrMethod of classDeclarationNodes) {
      if (propertyOrMethod.kind === 'constructor') {
        nodes = [propertyOrMethod];
        break;
      }
    }
  } else {
    nodes = [body[0] as FunctionDeclaration];
  }

  return nodes.reduce((args, exp) => {
    if ((exp as FunctionDeclaration).params) {
      return args.concat((exp as FunctionDeclaration).params);
    }
    if ('value' in exp && exp.value != null && ((exp as MethodDefinition).value).params) {
      return args.concat((exp as MethodDefinition).value.params);
    }
    if ('expression' in exp && exp.expression != null && ((exp as ExpressionStatement).expression as FunctionExpression).params) {
      return args.concat(((exp as ExpressionStatement).expression as FunctionExpression).params);
    }
    return args;
  }, []).map(pluckParamName);
};

/**
 * @internal
 */
export const isSameConstructor = (ctorOrCtorName, ctor2): boolean =>
  (typeof ctorOrCtorName === 'string' && ctorOrCtorName === ctor2.name) || ctorOrCtorName === ctor2;

/**
 * @internal
 */
export const isExtensionOf = (ctor, ctorExtensionOf): boolean => {
  if (typeof ctor === 'string') {
    let parent = Object.getPrototypeOf(ctorExtensionOf);
    while (parent.name) {
      if (parent.name === ctor) {
        return true;
      }
      // get parent class
      parent = Object.getPrototypeOf(parent);
    }
  } else {
    return ctor !== ctorExtensionOf && ctorExtensionOf.prototype instanceof ctor;
  }
  return false;
};

/**
 * @internal
 */
export const isSameConstructorOrExtensionOf = (ctorOrCtorName, ctor2): boolean =>
  (isSameConstructor(ctorOrCtorName, ctor2) || isExtensionOf(ctorOrCtorName, ctor2));

/**
 * @internal
 */
export const isSameConstructorOrExtensionOfNoObject = (ctorOrCtorName, ctor2): boolean =>
  ctorOrCtorName !== Object && (isSameConstructor(ctorOrCtorName, ctor2) || isExtensionOf(ctorOrCtorName, ctor2));

/**
 * @internal
 */
export const hasIterationProtocol = (variable): boolean =>
  variable !== null && Symbol.iterator in Object(variable);

/**
 * @internal
 */
export const isIterableNoMapNoString = (variable): boolean =>
  typeof variable !== 'string' &&
  !(isSameConstructorOrExtensionOfNoObject(variable.constructor, Map)) &&
  hasIterationProtocol(variable);

/**
 * @internal
 */
export const isIterableNoString = (variable): boolean =>
  typeof variable !== 'string' &&
  hasIterationProtocol(variable);

/**
 * @internal
 */
export const isClassIterableNoMap = (ctor: ClassType<any>): boolean =>
  !(isSameConstructorOrExtensionOfNoObject(ctor, Map)) &&
  hasIterationProtocol(ctor.prototype);

/**
 * @internal
 */
export const isClassIterableNoMapNoString = (ctor: ClassType<any>): boolean =>
  !(isSameConstructorOrExtensionOfNoObject(ctor, String)) &&
  !(isSameConstructorOrExtensionOfNoObject(ctor, Map)) &&
  hasIterationProtocol(ctor.prototype);

/**
 * @internal
 */
export const isClassIterable = (ctor: ClassType<any>): boolean => hasIterationProtocol(ctor.prototype);

/**
 * https://stackoverflow.com/a/1482209/4637638
 * @internal
 */
export const isObjLiteral = (_obj: any): boolean => {
  let _test  = _obj;
  return ( typeof _obj !== 'object' || _obj === null ?
    false :
    (
      (() => {
        while (true) {
          if (  Object.getPrototypeOf( _test = Object.getPrototypeOf(_test)  ) === null) {
            break;
          }
        }
        return Object.getPrototypeOf(_obj) === _test;
      })()
    )
  );
};

/**
 * https://stackoverflow.com/a/3886106/4637638
 * @internal
 */
export const isInt = (n: number) => Number(n) === n && n % 1 === 0;

/**
 * https://stackoverflow.com/a/3886106/4637638
 * @internal
 */
export const isFloat = (n: number) => Number(n) === n && n % 1 !== 0;

/**
 * find metadata considering also _internalDecorators
 * @internal
 */
export const findMetadataByMetadataKeyWithContext = <T extends JsonDecoratorOptions>(
  metadataKeyWithContext: string,
  target: Record<string, any>,
  propertyKey: string | symbol = null,
  context: JsonStringifierParserCommonContext<any>): T => {

  let jsonDecoratorOptions: JsonDecoratorOptions = (propertyKey) ?
    Reflect.getMetadata(metadataKeyWithContext, target, propertyKey) :
    Reflect.getMetadata(metadataKeyWithContext, target);

  // search also on its prototype chain
  let parent = target;
  while (jsonDecoratorOptions == null && parent.name) {
    if (jsonDecoratorOptions == null && propertyKey == null && context != null && context._internalDecorators != null) {
      const map = context._internalDecorators.get(parent as ObjectConstructor);
      if (map != null && metadataKeyWithContext in map) {
        jsonDecoratorOptions = map[metadataKeyWithContext] as JsonDecoratorOptions;
      }
    }
    // get parent class
    parent = Object.getPrototypeOf(parent);
  }

  return jsonDecoratorOptions as T;
};

/**
 * @internal
 */
export const findMetadata = <T extends JsonDecoratorOptions>(metadataKey: string,
  target: Record<string, any>,
  propertyKey: string | symbol = null,
  context: JsonStringifierParserCommonContext<any>): T => {
  let jsonDecoratorOptions: JsonDecoratorOptions = null;

  const contextGroupsWithDefault = [
    ...(context.withContextGroups ? context.withContextGroups : []),
    DefaultContextGroup
  ];

  for (const contextGroup of contextGroupsWithDefault) {
    const metadataKeyWithContext = makeMetadataKeyWithContext(metadataKey, {contextGroup});

    jsonDecoratorOptions = findMetadataByMetadataKeyWithContext(
      metadataKeyWithContext,
      target,
      propertyKey,
      context
    );

    if (jsonDecoratorOptions != null) {
      break;
    }
  }

  return jsonDecoratorOptions as T;
};

/**
 * @internal
 */
export const getMetadata = <T extends JsonDecoratorOptions>(metadataKey: string,
  target: Record<string, any>,
  propertyKey: string | symbol = null,
  context: JsonStringifierParserCommonContext<any>): T => {
  const jsonDecoratorOptions: JsonDecoratorOptions = metadataKey.startsWith('jackson:') ?
    findMetadataByMetadataKeyWithContext(metadataKey, target, propertyKey, context) :
    findMetadata(metadataKey, target, propertyKey, context) ;

  if (jsonDecoratorOptions && context && context.decoratorsEnabled) {
    const decoratorKeys = Object.keys(context.decoratorsEnabled);
    const decoratorKey = decoratorKeys.find((key) =>
      (metadataKey.startsWith('jackson:')) ?
        metadataKey.includes(':' + key) :
        metadataKey.startsWith(key));
    if (decoratorKey && typeof context.decoratorsEnabled[decoratorKey] === 'boolean') {
      jsonDecoratorOptions.enabled = context.decoratorsEnabled[decoratorKey];
    }
  }
  return jsonDecoratorOptions && jsonDecoratorOptions.enabled ? jsonDecoratorOptions as T : undefined;
};

const findMetadataKeysCache = new Map<Record<string, any>, any[]>();

/**
 * find all metadataKeys considering also _internalDecorators
 * @internal
 */
export const findMetadataKeys = <T extends JsonDecoratorOptions>(target: Record<string, any>,
  context: JsonStringifierParserCommonContext<any>): any[] => {

  if (findMetadataKeysCache.has(target)) {
    return findMetadataKeysCache.get(target);
  }

  const metadataKeys = new Set(cachedReflectGetMetadataKeys(target));
  const contextGroupsWithDefault = [
    ...(context.withContextGroups ? context.withContextGroups : []),
    DefaultContextGroup
  ];

  if (context != null && context._internalDecorators != null) {
    // search also on its prototype chain
    let parent = target;
    while (parent.name) {
      const internalDecorators = context._internalDecorators.get(parent as ObjectConstructor);
      for (const key in internalDecorators) {
        if (key === 'depth') {
          continue;
        }
        metadataKeys.add(key);
      }
      // get parent class
      parent = Object.getPrototypeOf(parent);
    }
  }

  for (const metadataKey of metadataKeys) {
    let metadataKeyFoundInContext = false;
    for (const contextGroup of contextGroupsWithDefault) {
      if (metadataKey.startsWith('jackson:' + contextGroup + ':')) {
        metadataKeyFoundInContext = true;
        break;
      }
    }
    if (!metadataKeyFoundInContext || !metadataKey.startsWith('jackson:')) {
      metadataKeys.delete(metadataKey);
    }
  }
  findMetadataKeysCache.set(target, [...metadataKeys]);
  return findMetadataKeysCache.get(target);
};

/**
 * @internal
 */
export const getMetadataKeys = <T extends JsonDecoratorOptions>(target: Record<string, any>,
  context: JsonStringifierParserCommonContext<any>): any[] => {
  let metadataKeys = findMetadataKeys(target, context);

  if (context != null && context.decoratorsEnabled != null) {
    const decoratorKeys = Object.keys(context.decoratorsEnabled);
    metadataKeys = metadataKeys.filter((metadataKey) => {
      const decoratorKey = decoratorKeys.find((key) =>
        (metadataKey.startsWith('jackson:')) ?
          metadataKey.replace('jackson:', '').includes(':' + key) :
          metadataKey.startsWith(key));
      return context.decoratorsEnabled[decoratorKey] == null || context.decoratorsEnabled[decoratorKey];
    });
  }
  return metadataKeys;
};

/**
 * @internal
 */
export const hasMetadata = <T extends JsonDecoratorOptions>(metadataKey: string,
  target: Record<string, any>,
  propertyKey: string | symbol = null,
  context: JsonStringifierParserCommonContext<any>): boolean => {
  const option: JsonDecoratorOptions = getMetadata<T>(metadataKey, target, propertyKey, context);
  return option != null;
};

/**
 * @internal
 */
export const isVariablePrimitiveType = (value: any): boolean => value != null && isConstructorPrimitiveType(value.constructor);

/**
 * @internal
 */
export const isConstructorPrimitiveType = (ctor: any): boolean => ctor === Number ||
  (hasBigInt && ctor === BigInt) || ctor === String ||
  ctor === Boolean || (Symbol && ctor === Symbol);

/**
 * @internal
 */
export const getDefaultPrimitiveTypeValue = (ctor: ClassType<any>): any | null => {
  switch (ctor) {
  case Number:
    return 0;
  case Boolean:
    return false;
  case String:
    return '';
  default:
    if (hasBigInt && ctor === BigInt) {
      return BigInt(0);
    }
  }
  return null;
};

/**
 * @internal
 */
export const getDefaultValue = (value: any): any | null => {
  if (value != null) {
    return getDefaultPrimitiveTypeValue(value.constructor);
  }
  return null;
};

/**
 * @internal
 */
export const isValueEmpty = (value: any): boolean => value == null ||
  ( (value instanceof Set || value instanceof Map) && value.size === 0 ) ||
  ( !(value instanceof Set || value instanceof Map) &&
    (typeof value === 'object' || typeof value === 'string') && Object.keys(value).length === 0 );

/**
 * @internal
 */
export const getDeepestClass = (array: Array<any>): any | null => {
  if (array == null || array.length === 0) {
    return null;
  }
  if (!(array[array.length - 1] instanceof Array)) {
    return array[array.length - 1];
  }
  return getDeepestClass(array[array.length - 1]);
};

/**
 * @internal
 */
export const getObjectKeysWithPropertyDescriptorNames = (obj: any, ctor: any,
                                                         context: JsonStringifierParserCommonContext<any>,
                                                         options?: GetClassPropertiesOptions): string[] => {
  if (obj == null) {
    return [];
  }
  const keys = Object.keys(obj);
  const classProperties = getClassProperties(ctor != null ? ctor : obj.constructor, null, context, options);

  if (keys.includes('constructor') &&
    typeof obj.constructor === 'function' &&
    !isNativeCode(obj.constructor) &&
    isNativeCode(obj.constructor.constructor)) {
    keys.splice(keys.indexOf('constructor'), 1);
  }

  return [...new Set([...keys, ...classProperties])];
};

/**
 * @internal
 */
export const objectHasOwnPropertyWithPropertyDescriptorNames =
  (obj: any, ctor: any, key: string, context: JsonStringifierParserCommonContext<any>,
   options?: GetClassPropertiesOptions): boolean => {
    if (obj == null || key == null) {
      return false;
    }
    return getObjectKeysWithPropertyDescriptorNames(obj, ctor, context, options).includes(key);
  };

/**
 * @internal
 */
export const castObjLiteral = (target: any, value: any): any => {
  if (isObjLiteral(value) && target !== Object) {
    let parent = target;
    while (parent.name && parent !== Object) {
      const propertyDescriptors = Object.getOwnPropertyDescriptors(parent.prototype);
      // eslint-disable-next-line guard-for-in
      for (const property in propertyDescriptors) {
        if (!Object.hasOwnProperty.call(value, property)) {

          const jsonPropertyMetadataKey = Reflect.getMetadataKeys(target, property)
            .find((metadataKey: string) => metadataKey.endsWith(':JsonProperty'));
          if (jsonPropertyMetadataKey != null) {
            const jsonPropertyOptions: JsonPropertyOptions = Reflect.getMetadata(jsonPropertyMetadataKey, target, property);
            if (jsonPropertyOptions && jsonPropertyOptions._descriptor == null) {
              continue;
            }
          }

          const ownPropertyDescriptor = {
            ...propertyDescriptors[property]
          };
          ownPropertyDescriptor.enumerable = false;
          Object.defineProperty(value, property, ownPropertyDescriptor);
        }
      }
      parent = Object.getPrototypeOf(parent);
    }
  }
  return value;
};

/**
 * Sort custom user-defined serializers/deserializers by its order.
 *
 * @param mappers
 * @internal
 */
export const sortMappersByOrder = <T>(mappers: CustomMapper<T>[]): CustomMapper<T>[] =>
  mappers.sort((a, b) => a.order - b.order > 0 ? 1 : -1);



// Cache call of Reflect.getMetadataKeys
const reflectGetMetadataKeysCache = new Map<Record<string, any>, any[]>();

/**
 * @internal
 */
const cachedReflectGetMetadataKeys = (target: Record<string, any>): any[] => {
  if (reflectGetMetadataKeysCache.has(target)) {
    return reflectGetMetadataKeysCache.get(target);
  }
  return reflectGetMetadataKeysCache.set(target, Reflect.getMetadataKeys(target)).get(target);
};


// Cache call of Reflect.getMetadataKeys
const reflectGetMetadataKeyForTargetCache = new Map<Record<string, any>, Map<any, any>>();

/**
 * @internal
 */
const cachedReflectGetMetadataKeyForTarget = (metadataKey: any, target: Record<string, any>): any => {
  let map1 = reflectGetMetadataKeyForTargetCache.get(target);
  if (map1 !== undefined) {
    if (map1.has(metadataKey)) {
      return map1.get(metadataKey);
    }
  } else {
    map1 = reflectGetMetadataKeyForTargetCache.set(target, new Map());
  }
  return map1.set(metadataKey, Reflect.getMetadata(metadataKey, target))
    .get(metadataKey);
};
