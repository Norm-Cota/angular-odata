import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

import { ODataEntitySet } from '../odata-response';
import { ODataEntitySetRequest, PlainObject, Filter, Expand, GroupBy, Select, OrderBy } from '../odata-request';

import { ODataModel, Model } from './model';
import { ODataModelService } from '../odata-service';

export class Collection<M extends Model> {
  static type: string = "";
  static modelType: string = "";
  _service: ODataModelService<M>;
  _query: ODataEntitySetRequest<M>;
  _models: M[];
  state: {
    page?: number,
    pages?: number,
    size?: number,
    records?: number,
  };

  constructor(models: PlainObject[], query?: ODataEntitySetRequest<M>) {
    this._models = this.parse(models, query);
    this.state = {
      records: this._models.length
    };
    this.setQuery(query);
  }

  setService(service: ODataModelService<M>) {
    this._service = service;
  }

  setQuery(query: ODataEntitySetRequest<M>) {
    this._query = query;
  }

  parse(models: PlainObject[], query: ODataEntitySetRequest<M>) {
    let ctor = <typeof Collection>this.constructor;
    return models.map(model => this._service.createInstance(ctor.modelType, model, query) as M);
  }

  toJSON() {
    let ctor = <typeof Collection>this.constructor;
    return this._models.map(model => model.toJSON());
  }

  public [Symbol.iterator]() {
    let pointer = 0;
    let models = this._models;
    return {
      next(): IteratorResult<M> {
        return {
          done: pointer === models.length,
          value: models[pointer++]
        };
      }
    }
  }
}

export class ODataCollection<M extends ODataModel> extends Collection<M> {
  constructor(
    models: PlainObject[],
    query: ODataEntitySetRequest<M>
  ) {
    super(models, query);
  }

  assign(entitySet: ODataEntitySet<ODataModel>, query: ODataEntitySetRequest<M>) {
    this.state.records = entitySet.count;
    let skip = entitySet.skip;
    if (skip)
      this.state.size = skip;
    if (this.state.size)
      this.state.pages = Math.ceil(this.state.records / this.state.size);
    this._models = this.parse(entitySet.entities, query);
    return this;
  }

  fetch(options?: any): Observable<this> {
    let query = this._query.clone() as ODataEntitySetRequest<M>;
    if (!this.state.page)
      this.state.page = 1;
    if (this.state.size) {
      query.top(this.state.size);
      query.skip(this.state.size * (this.state.page - 1));
    }
    return query.get()
      .pipe(
        map(set => this.assign(set, query))
      );
  }

  getPage(page: number, options?: any) {
    this.state.page = page;
    return this.fetch(options);
  }

  getFirstPage(options?: any) {
    return this.getPage(1, options);
  }

  getPreviousPage(options?: any) {
    return (this.state.page) ? this.getPage(this.state.page - 1, options) : this.fetch(options);
  }

  getNextPage(options?: any) {
    return (this.state.page) ? this.getPage(this.state.page + 1, options) : this.fetch(options);
  }

  getLastPage(options?: any) {
    return (this.state.pages) ? this.getPage(this.state.pages, options) : this.fetch(options);
  }

  setPageSize(size: number) {
    this.state.size = size;
    if (this.state.records) {
      this.state.pages = Math.ceil(this.state.records / this.state.size);
      if (this.state.page > this.state.pages)
        this.state.page = this.state.pages;
    }
  }

  // Mutate query
  select(select?: Select) {
    return this._query.select(select);
  }

  filter(filter?: Filter) {
    return this._query.filter(filter);
  }

  search(search?: string) {
    return this._query.search(search);
  }

  orderBy(orderBy?: OrderBy) {
    return this._query.orderBy(orderBy);
  }

  expand(expand?: Expand) {
    return this._query.expand(expand);
  }

  groupBy(groupBy?: GroupBy) {
    return this._query.groupBy(groupBy);
  }
}