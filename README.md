# Railway PR Deploy Action

## Introduction to Railway
[Railway](https://railway.app/) is a PaaS Cloud Service which makes it easy to deploy simple or complex services which can depend on many other services (APIs Databases etc)

This action makes it simple to deploy a PR environment based on an already existing environment in order to be able to test ephemeral API environments.

## Inputs

| Name                |         Required         | Default | Description                                                                                       |
|---------------------|:------------------------:|---------|---------------------------------------------------------------------------------------------------|
| RAILWAY_API_TOKEN        | [x] |         | Railway Token. See: https://railway.app/account/tokens                                       |
| PROJECT_ID      |  [x]    |  |The id of the project to create environments on. Can be found on Settings -> General page                               |
| SRC_ENVIRONMENT_NAME        | [x]|         | The name of the environment to base the PRs off of.                                 |
| SRC_ENVIRONMENT_ID   | [ ]|         | The id of the environment to base the PRs off of. If this is provided, SRC_ENVIRONMENT_NAME will be ignored. '                  |
| DEST_ENV_NAME       | [x] |         | The name of the deployed PR environment. Usually a combination of pr-<PR_NUMBER>-<SHORT_COMMIT_HASH> passed inside of workflow                 |
| ENV_VARS         | [ ]  |         | The environment variables to set on the PR environment. Should be a JSON object of key value pairs. e.g. ` '{"database_url": "${{ env.DYNAMIC_VAR }}", "other_key": "other_value"}'`        
| API_SERVICE_NAME         | [ ]  |         | The name of the API service to use for the PR environment. This is used to identify the domain of the deployed PR environment. Will default first this value otherwise it will instead try "app" then "backend" then 'web".                                      |
| PROVIDER   |  [x]  |         | 'The provider to use for the PR environment. Can be python, see https://nixpacks.com/docs/guides/configuring-builds for more info.'                                                                 |
| branch_name               | [x]  |         | The name of the branch you will be deploying from Github. Should be `${{ github.head_ref }}`         
| DEPLOYMENT_MAX_TIMEOUT       |  [ ]|         | 'The maximum amount of time to wait for the deployment to finish. Defaults to 10 minutes.'

## Outputs

### `service_domain`

The url of PR deployment preview. This would be an api endpoint for example for the service deployed.

## How To Use

```
    - name: Create PR environment on Railway
      if: github.event.action == 'opened'
      uses: Faolain/railway-pr-deploy@v2.0.4
      with:
        RAILWAY_API_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
        PROJECT_ID: ${{ secrets.RAILWAY_PROJECT_ID }}
        SRC_ENVIRONMENT_NAME: production
        DEST_ENV_NAME: pr-${{ github.event.pull_request.number }}
        PROVIDER: python
        ENV_VARS: '{"database_url": "${{ env.DYNAMIC_VAR }}", "other_key": "other_value"}'
        branch_name: ${{ github.head_ref }}
``````
