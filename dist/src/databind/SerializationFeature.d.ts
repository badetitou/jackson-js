/**
 * @packageDocumentation
 * @module Databind
 */
export declare enum SerializationFeature {
    FAIL_ON_SELF_REFERENCES = 0,
    ORDER_MAP_ENTRIES_BY_KEYS = 1,
    WRITE_NAN_AS_ZERO = 2,
    WRITE_POSITIVE_INFINITY_AS_NUMBER_MAX_SAFE_INTEGER = 3,
    WRITE_POSITIVE_INFINITY_AS_NUMBER_MAX_VALUE = 4,
    WRITE_NEGATIVE_INFINITY_AS_NUMBER_MIN_SAFE_INTEGER = 5,
    WRITE_NEGATIVE_INFINITY_AS_NUMBER_MIN_VALUE = 6,
    WRITE_DATES_AS_TIMESTAMPS = 7,
    SET_DEFAULT_VALUE_FOR_PRIMITIVES_ON_NULL = 8,
    SET_DEFAULT_VALUE_FOR_NUMBER_ON_NULL = 9,
    SET_DEFAULT_VALUE_FOR_STRING_ON_NULL = 10,
    SET_DEFAULT_VALUE_FOR_BOOLEAN_ON_NULL = 11,
    SET_DEFAULT_VALUE_FOR_BIGINT_ON_NULL = 12
}
