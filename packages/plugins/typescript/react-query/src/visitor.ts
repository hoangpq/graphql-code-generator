import {
  ClientSideBaseVisitor,
  ClientSideBasePluginConfig,
  LoadedFragment,
  DocumentMode,
} from '@graphql-codegen/visitor-plugin-common';
import { ReactQueryRawPluginConfig } from './config';
import autoBind from 'auto-bind';
import { OperationDefinitionNode, GraphQLSchema } from 'graphql';
import { Types } from '@graphql-codegen/plugin-helpers';
import { FetcherRenderer } from './fetcher';
import { FetchFetcher } from './fetcher-fetch';
import { HardcodedFetchFetcher } from './fetcher-fetch-hardcoded';
import { GraphQLRequestClientFetcher } from './fetcher-graphql-request';
import { CustomMapperFetcher } from './fetcher-custom-mapper';

export interface ReactQueryPluginConfig extends ClientSideBasePluginConfig {}

export class ReactQueryVisitor extends ClientSideBaseVisitor<ReactQueryRawPluginConfig, ReactQueryPluginConfig> {
  private _externalImportPrefix: string;
  public fetcher: FetcherRenderer;
  public reactQueryIdentifiersInUse = new Set<string>();

  constructor(
    schema: GraphQLSchema,
    fragments: LoadedFragment[],
    protected rawConfig: ReactQueryRawPluginConfig,
    documents: Types.DocumentFile[]
  ) {
    super(schema, fragments, rawConfig, {
      documentMode: DocumentMode.string,
    });
    this._externalImportPrefix = this.config.importOperationTypesFrom ? `${this.config.importOperationTypesFrom}.` : '';
    this._documents = documents;
    this.fetcher = this.createFetcher(rawConfig.fetcher || 'fetch');

    autoBind(this);
  }

  public get imports(): Set<string> {
    return this._imports;
  }

  private createFetcher(raw: ReactQueryRawPluginConfig['fetcher']): FetcherRenderer {
    if (raw === 'fetch') {
      return new FetchFetcher(this);
    } else if (typeof raw === 'object' && raw.endpoint) {
      return new HardcodedFetchFetcher(this, raw);
    } else if (raw === 'graphql-request') {
      return new GraphQLRequestClientFetcher(this);
    }

    return new CustomMapperFetcher(this, raw as string);
  }

  public getImports(): string[] {
    const baseImports = super.getImports();
    const hasOperations = this._collectedOperations.length > 0;

    if (!hasOperations) {
      return baseImports;
    }

    return [...baseImports, `import { ${Array.from(this.reactQueryIdentifiersInUse).join(', ')} } from 'react-query';`];
  }

  public getFetcherImplementation(): string {
    return this.fetcher.generateFetcherImplementaion();
  }

  protected buildOperation(
    node: OperationDefinitionNode,
    documentVariableName: string,
    operationType: string,
    operationResultType: string,
    operationVariablesTypes: string,
    hasRequiredVariables: boolean
  ): string {
    operationResultType = this._externalImportPrefix + operationResultType;
    operationVariablesTypes = this._externalImportPrefix + operationVariablesTypes;

    if (operationType === 'Query') {
      return this.fetcher.generateQueryHook(
        node,
        documentVariableName,
        operationResultType,
        operationVariablesTypes,
        hasRequiredVariables
      );
    } else if (operationType === 'Mutation') {
      return this.fetcher.generateMutationHook(
        node,
        documentVariableName,
        operationResultType,
        operationVariablesTypes,
        hasRequiredVariables
      );
    } else if (operationType === 'Subscription') {
      // eslint-disable-next-line no-console
      console.warn(
        `Plugin "typescript-react-query" does not support GraphQL Subscriptions at the moment! Ignoring "${node.name.value}"...`
      );
    }

    return null;
  }
}
