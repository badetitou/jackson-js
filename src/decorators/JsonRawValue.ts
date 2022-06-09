/**
 * @packageDocumentation
 * @module Decorators
 */

import {defineMetadata, makeJacksonDecorator} from '../util';
import {JsonRawValueDecorator, JsonRawValueOptions} from '../@types';

/**
 * Decorator that indicates that the decorated method or field should be serialized by
 * including literal String value of the property as is, without quoting of characters.
 * This can be useful for injecting values already serialized in JSON or
 * passing javascript function definitions from server to a javascript client.
 *
 * Warning: the resulting JSON stream may be invalid depending on your input value.
 *
 * @example
 * ```typescript
 * class User {
 *   @JsonProperty() @JsonClassType({type: () => [Number]})
 *   id: number;
 *   @JsonProperty() @JsonClassType({type: () => [String]})
 *   email: string;
 *   @JsonProperty() @JsonClassType({type: () => [String]})
 *   @JsonRawValue()
 *   otherInfo: string;
 *
 *   constructor(id: number, email: string, otherInfo: string) {
 *     this.id = id;
 *     this.email = email;
 *     this.otherInfo = otherInfo;
 *   }
 * }
 *
 * const user = new User(1, 'john.alfa@gmail.com', '{"other": "info 1", "another": "info 2"}');
 * const objectMapper = new ObjectMapper();
 *
 * const jsonData = objectMapper.stringify<User>(user);
 * ```
 */
export const JsonRawValue: JsonRawValueDecorator = makeJacksonDecorator(
  (o: JsonRawValueOptions): JsonRawValueOptions => ({enabled: true, ...o}),
  (options: JsonRawValueOptions, target, propertyKey) => {
    if (propertyKey != null) {
      defineMetadata('JsonRawValue', options, target.constructor, propertyKey);
    }
  });
