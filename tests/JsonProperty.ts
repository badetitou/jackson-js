import test from 'ava';
import {JacksonError} from '../src/core/JacksonError';
import {JsonProperty, JsonPropertyAccess} from '../src/decorators/JsonProperty';
import {ObjectMapper} from '../src/databind/ObjectMapper';
import {JsonClassType} from '../src/decorators/JsonClassType';

test('@JsonProperty with value', t => {
  class Employee {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty({value: 'empName'}) @JsonClassType({type: () => [String]})
    name: string;

    constructor(id: number, name: string) {
      this.id = id;
      this.name = name;
    }
  }

  const employee = new Employee(1, 'John');
  const objectMapper = new ObjectMapper();

  const jsonData = objectMapper.stringify<Employee>(employee);
  t.deepEqual(JSON.parse(jsonData), JSON.parse('{"id":1,"empName":"John"}'));
});

test('@JsonProperty with undefined primitive value', t => {
  class Employee {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty({value: 'empName'}) @JsonClassType({type: () => [String]})
    name: string;

    constructor(id: number, name: string) {
      this.id = id;
      this.name = name;
    }
  }

  const employee = new Employee(undefined, 'John');
  const objectMapper = new ObjectMapper();

  const jsonData = objectMapper.stringify<Employee>(employee);
  t.deepEqual(JSON.parse(jsonData), JSON.parse('{"empName":"John"}'));
});

test('@JsonProperty with null primitive value', t => {
  class Employee {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty({value: 'empName'}) @JsonClassType({type: () => [String]})
    name: string;

    constructor(id: number, name: string) {
      this.id = id;
      this.name = name;
    }
  }

  const employee = new Employee(null, 'John');
  const objectMapper = new ObjectMapper();

  const jsonData = objectMapper.stringify<Employee>(employee);
  t.deepEqual(JSON.parse(jsonData), JSON.parse('{"id":null,"empName":"John"}'));
});

test('@JsonProperty with undefined created value', t => {

  class Other {}

  class Employee {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty({value: 'empName'}) @JsonClassType({type: () => [String]})
    name: string;
    @JsonProperty() @JsonClassType({type: () => [Other]})
    other: Other | null;

    constructor(id: number, name: string, other: Other | null) {
      this.id = id;
      this.name = name;
      this.other = other;
    }
  }

  const employee = new Employee(1, 'John', undefined);
  const objectMapper = new ObjectMapper();

  const jsonData = objectMapper.stringify<Employee>(employee);
  t.deepEqual(JSON.parse(jsonData), JSON.parse('{"id":1,"empName":"John"}'));
});

test('@JsonProperty with null created value', t => {

  class Other {}

  class Employee {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty({value: 'empName'}) @JsonClassType({type: () => [String]})
    name: string;
    @JsonProperty() @JsonClassType({type: () => [Other]})
    other: Other | null;

    constructor(id: number, name: string, other: Other | null) {
      this.id = id;
      this.name = name;
      this.other = other;
    }
  }

  const employee = new Employee(1, 'John', null);
  const objectMapper = new ObjectMapper();

  const jsonData = objectMapper.stringify<Employee>(employee);
  t.deepEqual(JSON.parse(jsonData), JSON.parse('{"id":1,"empName":"John","other":null}'));
});

test('Fail @JsonProperty with required at parameter level', t => {
  class Employee {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty() @JsonClassType({type: () => [String]})
    name: string;

    constructor(id: number, @JsonProperty({required: true}) name: string) {
      this.id = id;
      this.name = name;
    }
  }

  const objectMapper = new ObjectMapper();
  const jsonData = '{"id":1}';

  const err = t.throws<JacksonError>(() => {
    objectMapper.parse<Employee>(jsonData, {mainCreator: () => [Employee]});
  });

  t.assert(err instanceof JacksonError);
});

test('Fail @JsonProperty with required at property level', t => {
  class Employee {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty({required: true}) @JsonClassType({type: () => [String]})
    name: string;

    constructor(id: number, name: string) {
      this.id = id;
      this.name = name;
    }
  }

  const objectMapper = new ObjectMapper();
  const jsonData = '{"id":1}';

  const err = t.throws<JacksonError>(() => {
    objectMapper.parse<Employee>(jsonData, {mainCreator: () => [Employee]});
  });

  t.assert(err instanceof JacksonError);
});

test('Fail @JsonProperty with required at method level', t => {
  class Employee {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty() @JsonClassType({type: () => [String]})
    name: string;

    constructor(id: number) {
      this.id = id;
    }

    @JsonProperty() @JsonClassType({type: () => [String]})
    getName(): string {
      return this.name;
    }

    @JsonProperty({required: true})
    setName(name: string) {
      this.name = name;
    }
  }

  const objectMapper = new ObjectMapper();
  const jsonData = '{"id":1}';

  const err = t.throws<JacksonError>(() => {
    objectMapper.parse<Employee>(jsonData, {mainCreator: () => [Employee]});
  });

  t.assert(err instanceof JacksonError);
});

test('@JsonProperty with JsonPropertyAccess.WRITE_ONLY', t => {
  class Employee {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty({value: 'empName', access: JsonPropertyAccess.WRITE_ONLY})
    @JsonClassType({type: () => [String]})
    name: string;
  }

  const employee = new Employee();
  employee.id = 1;
  employee.name = 'John';

  const objectMapper = new ObjectMapper();

  const jsonData = objectMapper.stringify<Employee>(employee);
  t.deepEqual(JSON.parse(jsonData), JSON.parse('{"id":1}'));

  const employeeParsed = objectMapper.parse<Employee>('{"id":1,"empName":"John"}', {mainCreator: () => [Employee]});
  t.assert(employeeParsed instanceof Employee);
  t.is(employeeParsed.id, 1);
  t.is(employeeParsed.name, 'John');
});

test('@JsonProperty with JsonPropertyAccess.READ_ONLY', t => {
  class Employee {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty({value: 'empName', access: JsonPropertyAccess.READ_ONLY})
    @JsonClassType({type: () => [String]})
    name: string;
  }

  const employee = new Employee();
  employee.id = 1;
  employee.name = 'John';

  const objectMapper = new ObjectMapper();

  const jsonData = objectMapper.stringify<Employee>(employee);
  t.deepEqual(JSON.parse(jsonData), JSON.parse('{"id":1,"empName":"John"}'));

  const err = t.throws<JacksonError>(() => {
    objectMapper.parse<Employee>(jsonData, {mainCreator: () => [Employee]});
  });

  t.assert(err instanceof JacksonError);
});

test('Using @JsonProperty as getters and setters at method level', t => {
  class Employee {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty() @JsonClassType({type: () => [String]})
    name: string;

    constructor(id: number) {
      this.id = id;
    }

    @JsonProperty() @JsonClassType({type: () => [String]})
    getName(): string {
      return this.name;
    }

    @JsonProperty()
    setName(name: string) {
      this.name = name;
    }
  }

  const employee = new Employee(1);
  employee.name = 'John';
  const objectMapper = new ObjectMapper();

  const jsonData = objectMapper.stringify<Employee>(employee);
  t.deepEqual(JSON.parse(jsonData), JSON.parse('{"id":1,"name":"John"}'));

  const employeeParsed = objectMapper.parse<Employee>(jsonData, {mainCreator: () => [Employee]});
  t.assert(employeeParsed instanceof Employee);
  t.is(employeeParsed.id, 1);
  t.is(employeeParsed.name, 'John');
  t.assert(!Object.hasOwnProperty.call(employeeParsed, 'getName'));
  t.assert(!Object.hasOwnProperty.call(employeeParsed, 'setName'));
});

test('Using @JsonProperty with virtual property as getters and setters', t => {
  class User {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty() @JsonClassType({type: () => [String]})
    firstname: string;
    @JsonProperty() @JsonClassType({type: () => [String]})
    lastname: string;

    constructor(id: number) {
      this.id = id;
    }

    @JsonProperty() @JsonClassType({type: () => [String]})
    getFullname(): string {
      return this.firstname + ' ' + this.lastname;
    }

    @JsonProperty()
    setFullname(fullname: string) {
      const fullnameSplitted = fullname.split(' ');
      this.firstname = fullnameSplitted[0];
      this.lastname = fullnameSplitted[1];
    }
  }

  const user = new User(1);
  user.firstname = 'John';
  user.lastname = 'Alfa';
  const objectMapper = new ObjectMapper();

  const jsonData = objectMapper.stringify<User>(user);
  t.deepEqual(JSON.parse(jsonData), JSON.parse('{"id":1,"firstname":"John","lastname":"Alfa","fullname":"John Alfa"}'));

  const userParsed = objectMapper.parse<User>(
    '{"id":1,"fullname":"John Alfa"}', {mainCreator: () => [User]});
  t.assert(userParsed instanceof User);
  t.is(userParsed.id, 1);
  t.is(userParsed.firstname, 'John');
  t.is(userParsed.lastname, 'Alfa');
  t.assert(!Object.hasOwnProperty.call(userParsed, 'getFullname'));
  t.assert(!Object.hasOwnProperty.call(userParsed, 'setFullname'));
  t.assert(!Object.hasOwnProperty.call(userParsed, 'fullname'));
});

test('Using @JsonProperty as getters and setters with value', t => {
  class User {
    @JsonProperty() @JsonClassType({type: () => [Number]})
    id: number;
    @JsonProperty() @JsonClassType({type: () => [String]})
    firstname: string;
    @JsonProperty() @JsonClassType({type: () => [String]})
    lastname: string;

    constructor(id: number) {
      this.id = id;
    }

    @JsonProperty({value: 'myFullname'}) @JsonClassType({type: () => [String]})
    getFullname(): string {
      return this.firstname + ' ' + this.lastname;
    }

    @JsonProperty({value: 'myFullname'})
    setFullname(fullname: string) {
      const fullnameSplitted = fullname.split(' ');
      this.firstname = fullnameSplitted[0];
      this.lastname = fullnameSplitted[1];
    }
  }

  const user = new User(1);
  user.firstname = 'John';
  user.lastname = 'Alfa';
  const objectMapper = new ObjectMapper();

  const jsonData = objectMapper.stringify<User>(user);
  t.deepEqual(JSON.parse(jsonData), JSON.parse('{"id":1,"firstname":"John","lastname":"Alfa","myFullname":"John Alfa"}'));

  const userParsed = objectMapper.parse<User>(
    '{"id":1,"myFullname":"John Alfa"}', {mainCreator: () => [User]});
  t.assert(userParsed instanceof User);
  t.is(userParsed.id, 1);
  t.is(userParsed.firstname, 'John');
  t.is(userParsed.lastname, 'Alfa');
  t.assert(!Object.hasOwnProperty.call(userParsed, 'getFullname'));
  t.assert(!Object.hasOwnProperty.call(userParsed, 'setFullname'));
  t.assert(!Object.hasOwnProperty.call(userParsed, 'myFullname'));
});
