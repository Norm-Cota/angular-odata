import { Parser, CallableConfig } from '../types';
import { ODataSchema } from './schema';
import { ODataCallableParser } from '../parsers';

export class ODataCallable<R> {
  schema: ODataSchema;
  name: string;
  path: string;
  bound?: boolean;
  composable?: boolean;
  parser: ODataCallableParser<R>;

  constructor(config: CallableConfig, schema: ODataSchema) {
    this.schema = schema;
    this.name = config.name;
    this.path = config.path || (config.bound ? `${schema.namespace}.${config.name}` : config.name);
    this.bound = config.bound;
    this.composable = config.composable;
    this.parser = new ODataCallableParser(config, schema.namespace);
  }

  isTypeOf(type: string) {
    var names = [`${this.schema.namespace}.${this.name}`];
    if (this.schema.alias)
      names.push(`${this.schema.alias}.${this.name}`);
    return names.indexOf(type) !== -1;
  }

  get api() {
    return this.schema.api;
  }

  configure(settings: { findParserForType: (type: string) => Parser<any> }) {
    const parserSettings = Object.assign({options: this.api.options}, settings);
    this.parser.configure(parserSettings);
  }
}
