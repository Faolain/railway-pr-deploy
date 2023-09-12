const axios = require('axios');
const core = require('@actions/core');
const { request, gql, GraphQLClient } = require('graphql-request')

// Railway Required Inputs
const RAILWAY_API_TOKEN = core.getInput('RAILWAY_API_TOKEN');
const PROJECT_ID = core.getInput('PROJECT_ID');
const SRC_ENVIRONMENT_NAME = core.getInput('SRC_ENVIRONMENT_NAME');
const SRC_ENVIRONMENT_ID = core.getInput('SRC_ENVIRONMENT_ID');
const DEST_ENV_NAME = core.getInput('DEST_ENV_NAME');
const ENV_VARS = core.getInput('ENV_VARS');
const PROVIDER = core.getInput('PROVIDER');
const ENDPOINT = 'https://backboard.railway.app/graphql/v2';

// Github Required Inputs
const BRANCH_NAME = core.getInput('branch_name');
const REPOSITORY = core.getInput('repository');

async function railwayGraphQLRequest(query, variables) {
    const client = new GraphQLClient(ENDPOINT, {
        headers: {
            Authorization: `Bearer ${RAILWAY_API_TOKEN}`,
        },
    })
    try {
        return await client.request({ document: query, variables })
    } catch (error) {
        core.setFailed(`Action failed with error: ${error}`);
    }
}

async function getEnvironmentId() {
    let query =
        `query environments($projectId: String!) {
            environments(projectId: $projectId) {
                edges {
                    node {
                        id
                        name
                        serviceInstances {
                            edges {
                                node {
                                    domains {
                                        serviceDomains {
                                            domain
                                        }
                                    }
                                    serviceId
                                    startCommand
                                }
                            }
                        }
                    }
                }
            }
        }`

    const variables = {
        "projectId": PROJECT_ID,
    }

    return await railwayGraphQLRequest(query, variables)
}

async function createEnvironment(sourceEnvironmentId) {
    try {
        let query = gql`
        mutation environmentCreate($input: EnvironmentCreateInput!) {
            environmentCreate(input: $input) {
                id
                createdAt
                deploymentTriggers {
                    edges {
                        node {
                            id
                            environmentId
                            branch
                            projectId
                        }
                    }
                }
                serviceInstances {
                    edges {
                        node {
                            id
                            domains {
                                serviceDomains {
                                    domain
                                    id
                                }
                            }
                        }
                    }
                }
            }
        }
        `
        const variables = {
            input: {
                "name": DEST_ENV_NAME,
                "projectId": PROJECT_ID,
                "sourceEnvironmentId": sourceEnvironmentId
            }
        }
        return await railwayGraphQLRequest(query, variables);
    } catch (error) {
        core.setFailed(`Action failed with error: ${error}`);
    }
}

async function updateEnvironment(environmentId, serviceId, variables) {
    const parsedVariables = JSON.parse(variables);

    try {
        let query = gql`
        mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
            variableCollectionUpsert(input: $input)
        }
        `

        let variables = {
            input: {
                "environmentId": environmentId,
                "projectId": PROJECT_ID,
                "serviceId": serviceId,
                "variables": parsedVariables
            }
        }

        return await railwayGraphQLRequest(query, variables)
    } catch (error) {
        core.setFailed(`Action failed with error: ${error}`);
    }
}

async function deploymentTriggerUpdate(deploymentTriggerId) {
    try {
        let query = gql`
        mutation deploymentTriggerUpdate($id: String!, $input: DeploymentTriggerUpdateInput!) {
            deploymentTriggerUpdate(id: $id, input: $input) {
                id
            }
        }
        `

        let variables = {
            id: deploymentTriggerId,
            input: {
                "branch": BRANCH_NAME,
            }
        }

        return await railwayGraphQLRequest(query, variables)
    } catch (error) {
        core.setFailed(`Action failed with error: ${error}`);
    }
}

async function checkIfEnvironmentExists() {
    let response = await getEnvironmentId();
    const filteredEdges = response.environments.edges.filter((edge) => edge.node.name === DEST_ENV_NAME);
    return filteredEdges.length == 1 ? { environmentId: filteredEdges[0].node.id, serviceId: filteredEdges[0].serviceInstances.edges[0].serviceId } : null;
}

async function deleteEnvironment(environmentId) {
    try {
        let query = gql`
        mutation environmentDelete($id: String!) {
            environmentDelete(id: $id)
        }
        `

        let variables = {
            "environmentId": environmentId,
        }

        return await railwayGraphQLRequest(query, variables)
    } catch (error) {
        core.setFailed(`Action failed with error: ${error}`);
    }
}

async function run() {
    try {
        const environmentIfExists = await checkIfEnvironmentExists();
        if (environmentIfExists) {
            throw new Error('Environment already exists. Please delete the environment via API or Railway Dashboard and try again.')
        }

        console.log('Environment does not exist, creating new Environment...')
        let srcEnvironmentId = SRC_ENVIRONMENT_ID;

        // Get Source Environment ID to base new PR environment from
        if (!SRC_ENVIRONMENT_ID) {
            let response = await getEnvironmentId();
            srcEnvironmentId = response.environments.edges.filter((edge) => edge.node.name === SRC_ENVIRONMENT_NAME)[0].node.id;
        }

        // Create the new Environment based on the Source Environment
        const createdEnvironment = await createEnvironment(srcEnvironmentId);
        console.dir(createdEnvironment, { depth: null })

        const { id: environmentId } = createdEnvironment.environmentCreate;
        const { id: deploymentTriggerId } = createdEnvironment.environmentCreate.deploymentTriggers.edges[0].node;

        // Set the Deployment Trigger Branch
        await deploymentTriggerUpdate(deploymentTriggerId);

        // Get the Service ID
        const { serviceId } = createdEnvironment.environmentCreate.serviceInstances.edges[0].node;

        // Update the Environment Variables
        const updatedEnvironmentVariables = await updateEnvironment(environmentId, serviceId, ENV_VARS);

        const { domain } = createdEnvironment.environmentCreate.serviceInstances.edges[0].node.domains.serviceDomains[0];
        console.log('domain', domain)
        core.setOutput('service_domain', domain);
    } catch (error) {
        console.error('Error in API calls:', error);
        // Handle the error, e.g., fail the action
        core.setFailed('API calls failed');
    }
}

run();