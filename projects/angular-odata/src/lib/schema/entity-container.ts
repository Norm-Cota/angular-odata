import { ODataSchema } from './schema';
import { EntityContainerConfig } from '../types';
import { ODataEntitySet } from './entity-set';
import { ODataAnnotation } from './annotation';

export class ODataEntityContainer {
  schema: ODataSchema;
  name: string;
  annotations: ODataAnnotation[];
  entitySets: ODataEntitySet[];
  constructor(config: EntityContainerConfig, schema: ODataSchema) {
    this.schema = schema;
    this.name = config.name;
    this.annotations = (config.annotations || []);
    this.entitySets = (config.entitySets || []).map(config => new ODataEntitySet(config, schema));
    this.annotations = (config.annotations || []).map(annot => new ODataAnnotation(annot));
  }

  get options() {
    return this.schema.options;
  }
}
