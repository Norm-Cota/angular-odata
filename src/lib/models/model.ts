import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import {
  ODataResource,
  ODataEntityResource,
  ODataPropertyResource,
  ODataFunctionResource,
  ODataActionResource,
  ODataAnnotations,
  ODataEntityAnnotations,
  Expand,
  Select
} from '../resources';

import { ODataCollection } from './collection';
import { ODataNavigationPropertyResource } from '../resources/requests/navigationproperty';
import {
  HttpOptions,
  HttpValueOptions,
  HttpEntityOptions
} from '../resources/http-options';
import { VALUE } from '../types';
import { ODataCallableResource } from '../resources/requests/callable';
import { ODataField } from './parser';
import { Types } from '../utils';

export class ODataModel<T> {
  private _resource: ODataResource<T>;
  private _entity: T;
  private _annotations: ODataAnnotations;
  private _relationships: { [name: string]: ODataModel<any> | ODataCollection<any, ODataModel<any>> }

  constructor(entity?: Partial<T>, options: { resource?: ODataResource<T>, annotations?: ODataAnnotations } = {}) {
    if (options.resource instanceof ODataResource)
      this.attach(options.resource);
    this.populate((entity || {}) as T, options.annotations);
  }

  attach(resource: ODataResource<T>) {
    if (this._resource && this._resource.type() !== resource.type())
      throw new Error(`Can't reattach ${resource.type()} with ${this._resource.type()}`);
    let first = !this._resource;
    this._resource = resource;
    if (first) {
      this._resource.meta().fields()
        .filter(field => field.navigation)
        .forEach(field => {
          Object.defineProperty(this, field.name, {
            get() {
              return this.getNavigationProperty(field.name);
            },
            set(model: ODataModel<any> | null) {
              return this.setNavigationProperty(field.name, model);
            }
          });
        });
      if (this._entity)
        this.populate(this._entity, this._annotations);
    }
    return this;
  }

  target() {
    return this._resource.clone() as ODataResource<T>;
  }

  protected parse(entity: T) {
    let fields = this._resource.meta().fields();
    let entries = Object.entries(entity)
      .map(([key, value]) => [key, value, fields.find(f => f.name === key)]);
    //Attributes
    let attrs = Object.assign({}, entries
      .filter(([, , f]) => f && !f.navigation)
      .reduce((acc, [k, v]) => Object.assign(acc, { [k]: v }), {}));
    //console.log(attrs);
    //Others
    Object.assign(attrs, entries
      .filter(([, , f]) => !f)
      .reduce((acc, [k, v]) => Object.assign(acc, { [k]: v }), {}));
    //console.log(attrs);
    //Complexes
    Object.assign(attrs, entries
      .filter(([, , f]) => f && !f.navigation && f.parser)
      .reduce((acc, [k, , f]) => {
        let value = this._entity[f.name];
        if (value) {
          let prop = (this._resource as ODataEntityResource<T>).property(f.name);
          var base = f.collection && this._annotations.property(f.name) || {};
          value = prop.toRelated(value, base);
        }
        return Object.assign(acc, { [k]: value });
      }, {}));
    //console.log(attrs);
    return attrs;
  }

  protected populate(entity: T, annots?: ODataAnnotations) {
    this._entity = entity;
    this._annotations = annots;
    this._relationships = {};
    Object.assign(this, this._resource ? this.parse(this._entity) : this._entity);
    return this;
  }

  toEntity(): T {
    if (this._resource) {
      let entity = {} as T;
      this._resource.meta().fields().forEach(field => {
        if (field.parser) {
          if (field.navigation) {
            if (field.name in this._relationships) {
              let rel = this._relationships[field.name];
              entity[field.name] = (rel instanceof ODataModel) ? rel.toEntity() : rel.toEntities();
            }
          } else if (this[field.name] !== undefined) {
            let complex = this[field.name];
            entity[field.name] = (complex instanceof ODataModel) ? complex.toEntity() : complex.toEntities();
          }
        } else if (this[field.name] !== undefined) {
          entity[field.name] = this[field.name];
        }
      });
      return entity;
    } else {
      let keys = Object.keys(this).filter(k => !(k.startsWith("_") || Types.isFunction(this[k])));
      return keys.reduce((acc, k) => Object.assign(acc, { [k]: this[k] }), {}) as T;
    }
  }

  clone() {
    let Ctor = <typeof ODataModel>this.constructor;
    return (new Ctor(this.toEntity(), { resource: this._resource.clone(), annotations: this._annotations })) as ODataModel<T>;
  }

  fetch(options?: HttpOptions): Observable<this | null> {
    let obs$: Observable<any>;
    if (this._resource instanceof ODataEntityResource) {
      this._resource.key(this);
      if (!this._resource.hasKey())
        throw new Error(`Can't fetch entity without key`);
      obs$ = this._resource.get(options);
    } else if (this._resource instanceof ODataNavigationPropertyResource) {
      obs$ = this._resource.get(
        Object.assign<HttpEntityOptions, HttpOptions>(<HttpEntityOptions>{responseType: 'entity'}, options || {}));
    } else if (this._resource instanceof ODataPropertyResource) {
      obs$ = this._resource.get(
        Object.assign<HttpValueOptions, HttpOptions>(<HttpValueOptions>{responseType: 'value'}, options || {}));
    } else if (this._resource instanceof ODataFunctionResource) {
      obs$ = this._resource.get(
        Object.assign<HttpEntityOptions, HttpOptions>(<HttpEntityOptions>{responseType: 'entity'}, options || {}));
    }
    if (!obs$)
      throw new Error("Not Yet!");
    return obs$.pipe(
      map(([entity, annots]) => entity ? this.populate(entity, annots) : null));
  }

  create(options?: HttpOptions): Observable<this> {
    if (this._resource instanceof ODataEntityResource) {
      return this._resource.post(this.toEntity(), options).pipe(map(([entity, annots]) => this.populate(entity, annots)));
    }
    throw new Error(`Can't create`);
  }

  update(options?: HttpOptions): Observable<this> {
    if (this._resource instanceof ODataEntityResource) {
      this._resource.key(this);
      if (!this._resource.hasKey())
        throw new Error(`Can't update entity without key`);
      let etag = (this._annotations && this._annotations instanceof ODataEntityAnnotations) ? this._annotations.etag : undefined;
      return this._resource.put(this.toEntity(), Object.assign({ etag }, options || {})).pipe(map(([entity, annots]) => this.populate(entity, annots)));
    }
    throw new Error(`Can't update`);
  }

  save(options?: HttpOptions): Observable<this> {
    if (this._resource instanceof ODataEntityResource) {
      this._resource.key(this);
      return this._resource.hasKey() ? this.update(options) : this.create(options);
    }
    throw new Error(`Can't save`);
  }

  destroy(options?: HttpOptions): Observable<null> {
    if (this._resource instanceof ODataEntityResource) {
      this._resource.key(this);
      if (!this._resource.hasKey())
        throw new Error(`Can't destroy entity without key`);
      let etag = (this._annotations && this._annotations instanceof ODataEntityAnnotations) ? this._annotations.etag : undefined;
      return this._resource.delete(Object.assign({ etag }, options || {}));
    }
    throw new Error(`Can't destroy`);
  }

  protected get _segments() {
    if (!this._resource)
      throw new Error(`Can't call without ODataResource`);
    if (this._resource instanceof ODataEntityResource) {
      this._resource.key(this);
      if (!this._resource.hasKey())
        throw new Error(`Can't use without key`);
    }
    let resource = this._resource as ODataEntityResource<T>;
    return {
      // Function
      function<R>(name: string, returnType?: string): ODataFunctionResource<R> { return resource.function<R>(name, returnType); },
      // Action
      action<R>(name: string, returnType?: string): ODataActionResource<R> { return resource.action<R>(name, returnType); },
      // Navigation
      navigationProperty<P>(name: string): ODataNavigationPropertyResource<P> { return resource.navigationProperty<P>(name); }
    };
  }

  get _query() {
    if (!this._resource)
      throw new Error(`Can't query without ODataResource`);
    if (this._resource instanceof ODataEntityResource) {
      this._resource.key(this);
      if (!this._resource.hasKey())
        throw new Error(`Can't query without key`);
    }
    let resource = this._resource as ODataEntityResource<T>;
    return {
      // Select
      select(select?: Select<T>) { return resource.select(select); },
      // Expand
      expand(expand?: Expand<T>) { return resource.expand(expand); },
      // Alias value
      alias(name: string, value?: any) { return resource.alias(name, value); }
    };
  }

  protected getNavigationProperty<P>(name: string): ODataModel<P> | ODataCollection<P, ODataModel<P>> {
    let field = this._resource.meta().fields().find(f => f.name === name);
    if (!(name in this._relationships)) {
      let value = this._entity[field.name];
      if (value) {
        let nav = this._segments.navigationProperty<P>(field.name);
        var base = field.collection && this._annotations.property(field.name) || {};
        value = nav.toRelated(value, base);
      }
      this._relationships[field.name] = value; 
    }
    return this._relationships[field.name];
  }

  protected setNavigationProperty<P, Pm extends ODataModel<P>>(name: string, model: Pm | null): Observable<this> {
    let field = this._resource.meta().fields().find(f => f.name === name);
    if (field.collection)
      throw new Error(`Can't set ${field.name} to collection, use add`);
    let ref = this._segments.navigationProperty<P>(name).reference();
    let etag = (this._annotations as ODataEntityAnnotations).etag;
    // TODO: change the resource of a model 
    delete this._relationships[field.name];
    if (model instanceof ODataModel) {
      return ref.set(model._resource as ODataEntityResource<P>, { etag });
    } else if (model === null)
      return ref.remove({ etag });
  }
}
