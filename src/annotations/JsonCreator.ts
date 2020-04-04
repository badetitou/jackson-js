import {isClass, makeJacksonDecorator} from '../util';
import 'reflect-metadata';
import {JsonCreatorDecorator, JsonCreatorOptions} from '../@types';
import {JsonCreatorPrivateOptions} from '../@types/private';
import {JacksonError} from '../core/JacksonError';

export const defaultCreatorName = 'defaultCreatorName';

export const JsonCreator: JsonCreatorDecorator = makeJacksonDecorator(
  (o: JsonCreatorOptions = {}): JsonCreatorOptions => ({
    enabled: true,
    name: defaultCreatorName,
    ...o
  }),
  (options: JsonCreatorOptions, target, propertyKey, descriptorOrParamIndex) => {
    const privateOptions: JsonCreatorPrivateOptions = {
      ctor: null,
      method: null,
      propertyKey: (propertyKey) ? propertyKey.toString() : 'constructor',
      ...options
    };

    if (descriptorOrParamIndex && typeof descriptorOrParamIndex !== 'number' && typeof descriptorOrParamIndex.value === 'function') {
      privateOptions.method = descriptorOrParamIndex.value;
      if (privateOptions.name && Reflect.hasMetadata('jackson:JsonCreator:' + privateOptions.name, target)) {
        throw new JacksonError(`Already had a @JsonCreator() with name "${privateOptions.name}" for Class "${target.name}".`);
      }
      Reflect.defineMetadata('jackson:JsonCreator:' + privateOptions.name, privateOptions, target);
    } else if (!descriptorOrParamIndex && isClass(target)) {
      privateOptions.ctor = target;
      // get original constructor
      while (privateOptions.ctor.toString().trim().startsWith('class extends target {')) {
        privateOptions.ctor = Object.getPrototypeOf(privateOptions.ctor);
      }

      Reflect.defineMetadata('jackson:JsonCreator:' + privateOptions.name, privateOptions, target);
      return target;
    }
  });