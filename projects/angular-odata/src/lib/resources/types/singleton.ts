import { Observable } from 'rxjs';

import { Expand, Select, PlainObject } from '../builder';
import { QueryOptionNames } from '../query-options';
import { ODataPathSegments, PathSegmentNames } from '../path-segments';
import { ODataQueryOptions } from '../query-options';
import { ODataResource } from '../resource';

import { ODataNavigationPropertyResource } from './navigation-property';
import { ODataPropertyResource } from './property';
import { ODataActionResource } from './action';
import { ODataFunctionResource } from './function';
import { HttpOptions, HttpEntityOptions } from './options';
import { ODataStructuredTypeParser } from '../../parsers/structured-type';
import { ODataEntity, ODataEntityMeta } from '../responses';
import { map } from 'rxjs/operators';
import { ODataModel } from '../../models';
import { ODataApi } from '../../api';

export class ODataSingletonResource<T> extends ODataResource<T> {
  //#region Factory
  static factory<R>(api: ODataApi, path: string, type: string | undefined, segments: ODataPathSegments, options: ODataQueryOptions) {
    const segment = segments.add(PathSegmentNames.singleton, path)
    if (type !== undefined)
      segment.type(type);
    options.keep(QueryOptionNames.format);
    return new ODataSingletonResource<R>(api, segments, options);
  }

  clone() {
    return new ODataSingletonResource<T>(this.api, this.pathSegments.clone(), this.queryOptions.clone());
  }
  //#endregion

  asModel<M extends ODataModel<T>>(entity: Partial<T>, meta?: ODataEntityMeta): M {
    const Model = this.schema?.model || ODataModel;
    return new Model(entity, {resource: this, meta}) as M;
  }

  //#region Function Config
  get schema() {
    let type = this.type();
    return (type !== undefined) ? this.api.findStructuredTypeForType<T>(type) : undefined;
  }
  ////#endregion

  //#region Inmutable Resource
  navigationProperty<N>(path: string) {
    let type = this.type();
    if (type !== undefined) {
      let parser = this.api.findParserForType<N>(type);
      type = parser instanceof ODataStructuredTypeParser?
        parser.typeFor(path) : undefined;
    }
    return ODataNavigationPropertyResource.factory<N>(this.api, path, type, this.pathSegments.clone(), this.queryOptions.clone());
  }

  property<P>(path: string) {
    let type = this.type();
    if (type !== undefined) {
      let parser = this.api.findParserForType<P>(type);
      type = parser instanceof ODataStructuredTypeParser?
        parser.typeFor(path) : undefined;
    }
    return ODataPropertyResource.factory<P>(this.api, path, type, this.pathSegments.clone(), this.queryOptions.clone());
  }

  action<P, R>(name: string) {
    let type;
    let path = name;
    const callable = this.api.findCallableForType(name);
    if (callable !== undefined) {
      path = callable.path;
      type = callable.parser.type;
    }
    return ODataActionResource.factory<P, R>(this.api, path, type, this.pathSegments.clone(), this.queryOptions.clone());
  }

  function<P, R>(name: string) {
    let type;
    let path = name;
    const callable = this.api.findCallableForType(name);
    if (callable !== undefined) {
      path = callable.path;
      type = callable.parser.type;
    }
    return ODataFunctionResource.factory<P, R>(this.api, path, type, this.pathSegments.clone(), this.queryOptions.clone());
  }

  select(opts: Select<T>) {
    let options = this.queryOptions.clone();
    options.option<Select<T>>(QueryOptionNames.select, opts);
    return new ODataSingletonResource<T>(this.api, this.pathSegments.clone(), options);
  }

  expand(opts: Expand<T>) {
    let options = this.queryOptions.clone();
    options.option<Expand<T>>(QueryOptionNames.expand, opts);
    return new ODataSingletonResource<T>(this.api, this.pathSegments.clone(), options);
  }

  format(opts: string) {
    let options = this.queryOptions.clone();
    options.option<string>(QueryOptionNames.format, opts);
    return new ODataSingletonResource<T>(this.api, this.pathSegments.clone(), options);
  }

  custom(opts: PlainObject) {
    let options = this.queryOptions.clone();
    options.option<PlainObject>(QueryOptionNames.custom, opts);
    return new ODataSingletonResource<T>(this.api, this.pathSegments.clone(), options);
  }
  //#endregion

  //#region Mutable Resource
  get segment() {
    const segments = this.pathSegments;
    return {
      singleton() {
        return segments.get(PathSegmentNames.singleton);
      }
    }
  }

  get query() {
    const options = this.queryOptions;
    return {
      select(opts?: Select<T>) {
        return options.option<Select<T>>(QueryOptionNames.select, opts);
      },
      expand(opts?: Expand<T>) {
        return options.option<Expand<T>>(QueryOptionNames.expand, opts);
      },
      format(opts?: string) {
        return options.option<string>(QueryOptionNames.format, opts);
      },
      custom(opts?: PlainObject) {
        return options.option<PlainObject>(QueryOptionNames.custom, opts);
      }
    }
  }
  //#endregion

  //#region Requests
  get(options?: HttpOptions): Observable<ODataEntity<T>> {
    return super.get(
      Object.assign<HttpEntityOptions, HttpOptions>(<HttpEntityOptions>{responseType: 'entity'}, options || {})
      );
  }

  post(attrs: Partial<T>, options?: HttpOptions): Observable<ODataEntity<T>> {
    return super.post(attrs,
      Object.assign<HttpEntityOptions, HttpOptions>(<HttpEntityOptions>{responseType: 'entity'}, options || {})
    );
  }

  put(attrs: Partial<T>, options?: HttpOptions & { etag?: string }): Observable<ODataEntity<T>> {
    return super.put(attrs,
      Object.assign<HttpEntityOptions, HttpOptions>(<HttpEntityOptions>{responseType: 'entity'}, options || {})
    );
  }

  patch(attrs: Partial<T>, options?: HttpOptions & { etag?: string }): Observable<T> {
    return super.patch(attrs,
      Object.assign<HttpEntityOptions, HttpOptions>(<HttpEntityOptions>{responseType: 'entity'}, options || {})
    );
  }

  delete(options?: HttpOptions & { etag?: string }): Observable<any> {
    return super.delete(
      Object.assign<HttpEntityOptions, HttpOptions>(<HttpEntityOptions>{responseType: 'entity'}, options || {})
    );
  }
  //#endregion

  //#region Custom
  fetch(options?: HttpOptions): Observable<T | null> {
    return this.get(options).pipe(map(({entity}) => entity));
  }

  model(options?: HttpOptions): Observable<ODataModel<T> | null> {
    return this.get(options).pipe(map(({entity, meta}) => entity ? this.asModel(entity, meta) : null));
  }
  //#endregion
}
