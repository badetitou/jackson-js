# Changelog

## 1.4.4 - Optimize code

- Remove two array instantiations when performing `mapVirtualPropertyToClassProperty`
- Invert the condition of `getMetadata` to avoid a not
- Kill a useless `.replace()` of `getMetadata`
- Update dependency version (mainly `meriyah`)

## 1.4.1 - Optimize code

This release tries to optimize a lot the project in order to use it in industrial projects

## 1.1.0

- Update bundle dependencies
- Fixed `transform` methods when using Babel compiler
- Added `dateLibrary` option to `@JsonFormat()` and `JsonStringifierContext`
- Added `uuidLibrary` option to `@JsonIdentityInfo()` and `JsonStringifierContext`

### BREAKING CHANGES

- To be able to use `@JsonFormat()` on class properties of type "Date" with `JsonFormatShape.STRING`, a date library needs to be set. Date libraries supported: "https://github.com/moment/moment", "https://github.com/iamkun/dayjs/"
- To be able to use `@JsonIdentityInfo()` with any UUID `ObjectIdGenerator`, an UUID library needs to be set. UUID library supported: "https://github.com/uuidjs/uuid".

## 1.0.0

Initial release