/**
 * @packageDocumentation
 * @module Decorators
 */
import { JsonIgnoreDecorator } from '../@types';
/**
 * Decorator that indicates that the logical property that the accessor
 * (field, getter/setter method or Creator parameter [of JsonCreator-decorated constructor or factory method])
 * is to be ignored during serialization and deserialization functionality.
 *
 * Ignored properties will be undefined in a deserialized instance and will not appear in serialized JSON.
 *
 * @example
 * ```typescript
 * class Item {
 *   @JsonProperty() @JsonClassType({type: () => [Number]})
 *   id: number;
 *   @JsonProperty() @JsonClassType({type: () => [String]})
 *   name: string;
 *
 *   @JsonProperty() @JsonClassType({type: () => [String]})
 *   @JsonIgnore()
 *   category: string;
 * }
 * ```
 */
export declare const JsonIgnore: JsonIgnoreDecorator;
