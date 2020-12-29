import { Types } from '../utils';
import { Parser, StructuredTypeField, JsonSchemaExpandOptions, JsonSchemaConfig, StructuredTypeConfig, Annotation, OptionsHelper } from '../types';

const NONE_PARSER = {
  deserialize: (value: any, options: OptionsHelper) => value,
  serialize: (value: any, options: OptionsHelper) => value
} as Parser<any>;

export class ODataEntityFieldParser<Type> implements StructuredTypeField, Parser<Type> {
  name: string;
  type: string;
  private parser: Parser<Type>;
  default?: any;
  maxLength?: number;
  key: boolean;
  collection: boolean;
  nullable: boolean;
  navigation: boolean;
  field?: string;
  precision?: number;
  scale?: number;
  ref?: string;
  annotations: Annotation[];

  constructor(name: string, field: StructuredTypeField) {
    this.name = name;
    this.type = field.type;
    this.parser = NONE_PARSER;
    this.annotations = field.annotations || [];
    this.default = field.default;
    this.maxLength = field.maxLength;
    this.key = field.key !== undefined ? field.key : false;
    this.collection = field.collection !== undefined ? field.collection : false;
    this.nullable = field.nullable !== undefined ? field.nullable : true;
    this.navigation = field.navigation !== undefined ? field.navigation : false;
    this.field = field.field;
    this.precision = field.precision;
    this.scale = field.scale;
    this.ref = field.ref;
  }
  annotation(type: string) {
    return this.annotations.find(annot => annot.type === type);
  }

  resolve(value: any) {
    return (this.ref || this.name).split('/').reduce((acc, name) => acc[name], value);
  }

  // Deserialize
  private parse(parser: ODataEntityParser<Type>, value: any, options: OptionsHelper): any {
    const type = Types.isObject(value) ? options.helper.type(value) : undefined;
    if (type !== undefined) {
      return parser.findParser(c => c.isTypeOf(type)).deserialize(value, options);
    }
    return parser.deserialize(value, options);
  }

  deserialize(value: any, options: OptionsHelper): Type {
    const parser = this.parser;
    if (parser instanceof ODataEntityParser) {
      return Array.isArray(value) ?
        value.map(v => this.parse(parser, v, options)) :
        this.parse(parser, value, options);
    }
    return parser.deserialize(value, Object.assign({field: this}, options));
  }

  // Serialize
  private toJson(parser: ODataEntityParser<Type>, value: any, options: OptionsHelper): any {
    const type = Types.isObject(value) ? options.helper.type(value) : undefined;
    if (type !== undefined) {
      return parser.findParser(c => c.isTypeOf(type)).serialize(value, options);
    }
    return parser.serialize(value, options);
  }

  serialize(value: Type, options: OptionsHelper): any {
    const parser = this.parser;
    if (parser instanceof ODataEntityParser) {
      return Array.isArray(value) ?
        (value as any[]).map(v => this.toJson(parser, v, options)) :
        this.toJson(parser, value, options);
    }
    return parser.serialize(value, Object.assign({field: this}, options));
  }

  configure(settings: { findParserForType: (type: string) => Parser<any> | undefined }) {
    this.parser = settings.findParserForType(this.type) || NONE_PARSER;
  }

  // Json Schema
  toJsonSchema(options: JsonSchemaExpandOptions<Type> = {}) {
    let property: any = this.parser instanceof ODataEntityParser ? this.parser.toJsonSchema(options) : <any>{
      title: `The ${this.name} field`,
      type: this.parser ? "object" : this.type
    };
    if (this.maxLength)
      property.maxLength = this.maxLength;
    if (this.collection)
      property = {
        type: "array",
        items: property,
        additionalItems: false
      };
    return property;
  }

  isNavigation() {
    return this.navigation;
  }
  isComplexType() {
    return this.parser instanceof ODataEntityParser && this.parser.isComplexType();
  }
}

export class ODataEntityParser<Type> implements Parser<Type> {
  name: string;
  namespace: string;
  alias?: string;
  base?: string;
  parent?: ODataEntityParser<any>;
  children: ODataEntityParser<any>[];
  fields: ODataEntityFieldParser<any>[];

  constructor(config: StructuredTypeConfig<Type>, namespace: string, alias?: string) {
    this.name = config.name;
    this.base = config.base;
    this.namespace = namespace;
    this.alias = alias;
    this.children = [];
    this.fields = Object.entries(config.fields)
      .map(([name, f]) => new ODataEntityFieldParser(name, f as StructuredTypeField));
  }

  isTypeOf(type: string) {
    var names = [`${this.namespace}.${this.name}`];
    if (this.alias)
      names.push(`${this.alias}.${this.name}`);
    return names.indexOf(type) !== -1;
  }

  // Deserialize
  deserialize(value: any, options: OptionsHelper): Type {
    if (this.parent)
      value = this.parent.deserialize(value, options);
    return Object.assign({}, value, this.fields
      .filter(f => f.name in value && value[f.name] !== undefined && value[f.name] !== null)
      .reduce((acc, f) => Object.assign(acc, { [f.name]: f.deserialize(value[f.name], options) }), {})
    );
  }

  // Serialize
  serialize(value: Type, options: OptionsHelper): any {
    if (this.parent)
      value = this.parent.serialize(value, options);
    return Object.assign({}, value, this.fields
      .filter(f => f.name in value && (value as any)[f.name] !== undefined && (value as any)[f.name] !== null)
      .reduce((acc, f) => Object.assign(acc, { [f.name]: f.serialize((value as any)[f.name], options) }), {})
    );
  }

  configure(settings: { findParserForType: (type: string) => Parser<any> | undefined }) {
    if (this.base) {
      const parent = settings.findParserForType(this.base) as ODataEntityParser<any>;
      parent.children.push(this);
      this.parent = parent;
    }
    this.fields.forEach(f => f.configure(settings));
  }

  // Json Schema
  toJsonSchema(config: JsonSchemaConfig<Type> = {}) {
    let properties: any = this.fields
      .filter(f => (!f.navigation || (config.expand && f.name in config.expand)) && (!config.select || (<string[]>config.select).indexOf(f.name) !== -1))
      .map(f => ({ [f.name]: f.toJsonSchema((config as any)[f.name]) }))
      .reduce((acc, v) => Object.assign(acc, v), {});
    return {
      title: `The ${this.name} schema`,
      type: "object",
      description: `The ${this.name} configuration`,
      properties: properties,
      required: this.fields.filter(f => !f.nullable).map(f => f.name)
    };
  }

  typeFor(name: string): string | null {
    const field = this.fields.find(f => f.name === name);
    if (field === undefined && this.parent !== undefined)
      return this.parent.typeFor(name);
    return field !== undefined ? field.type : null;
  }

  keys() {
    const keys: ODataEntityFieldParser<any>[] = (this.parent) ? this.parent.keys() : [];
    return [...keys, ...this.fields.filter(f => f.key)];
  }

  resolveKey(attrs: any) {
    let key = this.keys()
      .reduce((acc, f) => Object.assign(acc, { [f.name]: f.resolve(attrs) }), {}) as any;
    const values = Object.values(key);
    if (values.length === 1) {
      // Single primitive key value
      key = values[0];
    } else if (values.some(v => v === undefined)) {
      // Compose key, needs all values
      key = null;
    }
    if (!Types.isEmpty(key))
      return key;
  }

  isComplexType() {
    return this.keys().length === 0;
  }

  find(predicate: (p: ODataEntityParser<any>) => boolean): ODataEntityParser<any> | undefined {
    if (predicate(this))
      return this;
    return this.children.find(c => c.find(predicate));
  }

  findParser(predicate: (p: ODataEntityParser<any>) => boolean): Parser<any> {
    return this.find(predicate) || NONE_PARSER;
  }
}
