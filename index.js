const core = require('@actions/core');
const { request, gql, GraphQLClient } = require('graphql-request')

// Railway Required Inputs
const RAILWAY_API_TOKEN = core.getInput('RAILWAY_API_TOKEN');
const PROJECT_ID = core.getInput('PROJECT_ID');
const SRC_ENVIRONMENT_NAME = core.getInput('SRC_ENVIRONMENT_NAME');
const SRC_ENVIRONMENT_ID = core.getInput('SRC_ENVIRONMENT_ID');
const DEST_ENV_NAME = core.getInput('DEST_ENV_NAME');
const FAIL_IF_EXISTS = core.getInput('FAIL_IF_EXISTS');
const ENV_VARS = core.getInput('ENV_VARS');
const API_SERVICE_NAME = core.getInput('API_SERVICE_NAME');
const IGNORE_SERVICE_REDEPLOY = core.getInput('IGNORE_SERVICE_REDEPLOY');
const ENDPOINT = 'https://backboard.railway.app/graphql/v2';

// Github Required Inputs
const BRANCH_NAME = core.getInput('branch_name') || "feat-railway-7";

// Optional Inputs
const DEPLOYMENT_MAX_TIMEOUT = core.getInput('MAX_TIMEOUT');

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

async function getProject() {
    let query =
        `query project($id: String!) {
            project(id: $id) {
                name
                services {
                    edges {
                        node {
                            id
                            name
                        }
                    }
                }
                environments {
                    edges {
                        node {
                            id
                            name
                            serviceInstances {
                                edges {
                                    node {
                                        serviceId
                                        startCommand
                                        domains {
                                            serviceDomains {
                                                domain
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }`

    const variables = {
        "id": PROJECT_ID,
    }

    return await railwayGraphQLRequest(query, variables)
}

async function getEnvironments() {
    let query =
        `query environments($projectId: String!) {
            environments(projectId: $projectId) {
                edges {
                    node {
                        id
                        name
                        createdAt
                        deployments {
                            edges {
                                node {
                                    id
                                    status
                                }
                            }
                        }
                        serviceInstances {
                            edges {
                                node {
                                    id
                                    domains {
                                        serviceDomains {
                                            id
                                            domain
                                        }
                                    }
                                    serviceId
                                    startCommand
                                }
                            }
                        }
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
    console.log("Creating Environment... based on source environment ID:", sourceEnvironmentId)
    try {
        let query = gql`
        mutation environmentCreate($input: EnvironmentCreateInput!) {
            environmentCreate(input: $input) {
                id
                name
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
                            serviceId
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
    console.log("Updating Deploying Trigger to new Branch Name")
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

async function serviceInstanceRedeploy(environmentId, serviceId) {
    console.log("Redeploying Service...")
    console.log("Environment ID:", environmentId)
    console.log("Service ID:", serviceId)
    try {
        let query = gql`
        mutation serviceInstanceRedeploy($environmentId: String!, $serviceId: String!) {
            serviceInstanceRedeploy(environmentId: $environmentId, serviceId: $serviceId)
        }
        `

        let variables = {
            "environmentId": environmentId,
            "serviceId": serviceId
        }

        return await railwayGraphQLRequest(query, variables)
    } catch (error) {
        core.setFailed(`Action failed with error: ${error}`);
    }
}

async function updateAllDeploymentTriggers(deploymentTriggerIds) {
    try {
        // Create an array of promises
        const updatePromises = deploymentTriggerIds.map(deploymentTriggerId =>
            deploymentTriggerUpdate(deploymentTriggerId)
        );

        // Await all promises
        await Promise.all(updatePromises);
        console.log("All deployment triggers updated successfully.");
    } catch (error) {
        console.error("An error occurred during the update:", error);
    }
}

async function updateEnvironmentVariablesForServices(environmentId, serviceInstances, ENV_VARS) {
    const serviceIds = [];

    // Extract service IDs
    for (const serviceInstance of serviceInstances.edges) {
        const { serviceId } = serviceInstance.node;
        serviceIds.push(serviceId);
    }

    try {
        // Create an array of promises for updating environment variables
        const updatePromises = serviceIds.map(serviceId =>
            updateEnvironment(environmentId, serviceId, ENV_VARS)
        );

        // Await all promises to complete
        await Promise.all(updatePromises);
        console.log("Environment variables updated for all services.");
    } catch (error) {
        console.error("An error occurred during the update:", error);
    }
}

async function redeployAllServices(environmentId, servicesToRedeploy) {
    try {
        // Create an array of promises for redeployments
        const redeployPromises = servicesToRedeploy.map(serviceId =>
            serviceInstanceRedeploy(environmentId, serviceId)
        );

        // Await all promises to complete
        await Promise.all(redeployPromises);
        console.log("All services redeployed successfully.");
    } catch (error) {
        console.error("An error occurred during redeployment:", error);
    }
}

async function getService(serviceId) {
    let query =
        `query environments($id: String!) {
            service(id: $id) {
                name
                }
        }`

    const variables = {
        "id": serviceId,
    }

    return await railwayGraphQLRequest(query, variables)
}

async function run() {
    try {
        // Get Environments to check if the environment already exists
        let response = await getEnvironments();

        // Filter the response to only include the environment name we are looking to create
        const filteredEdges = response.environments.edges.filter((edge) => edge.node.name === DEST_ENV_NAME);

        let environemnt = undefined
        // If there is a match this means the environment already exists
        if (filteredEdges.length == 1) {
            if (FAIL_IF_EXISTS === 'true') {
                throw new Error('Environment already exists. Please delete the environment via API or Railway Dashboard and try again. Alternatively, set the FAIL_IF_EXISTS input to "false" to re-use existing environments.')
            }
            environemnt = filteredEdges[0].node
            console.log("Re-using Environment:")
            console.dir(environemnt, { depth: null })
        } else {
            let srcEnvironmentId = SRC_ENVIRONMENT_ID;

            // If no source ENV_ID provided get Source Environment ID to base new PR environment from (aka use the same environment variables)
            if (!SRC_ENVIRONMENT_ID) {
                srcEnvironmentId = response.environments.edges.filter((edge) => edge.node.name === SRC_ENVIRONMENT_NAME)[0].node.id;
            }
    
            // Create the new Environment based on the Source Environment
            const createdEnvironment = await createEnvironment(srcEnvironmentId);
            environment = createdEnvironment.environmentCreate
            console.log("Created Environment:")
            console.dir(environment, { depth: null })
        }       

        const { id: environmentId } = environment;

        // Get all the Deployment Triggers
        const deploymentTriggerIds = [];
        for (const deploymentTrigger of environment.deploymentTriggers.edges) {
            const { id: deploymentTriggerId } = deploymentTrigger.node;
            deploymentTriggerIds.push(deploymentTriggerId);
        }

        // Get all the Service Instances
        const { serviceInstances } = environment;

        // Update the Environment Variables on each Service Instance
        await updateEnvironmentVariablesForServices(environmentId, serviceInstances, ENV_VARS);

        // Wait for the created environment to finish initializing
        console.log("Waiting 15 seconds for deployment to initialize and become available")
        await new Promise(resolve => setTimeout(resolve, 15000)); // Wait for 15 seconds

        // Set the Deployment Trigger Branch for Each Service 
        await updateAllDeploymentTriggers(deploymentTriggerIds);

        const servicesToIgnore = JSON.parse(IGNORE_SERVICE_REDEPLOY)
        const servicesToRedeploy = [];

        // Get the names for each deployed service
        for (const serviceInstance of environment.serviceInstances.edges) {
            const { domains } = serviceInstance.node;
            const { service } = await getService(serviceInstance.node.serviceId);
            const { name } = service;

            if (!servicesToIgnore.includes(name)) {
                servicesToRedeploy.push(serviceInstance.node.serviceId);
            }

            if ((API_SERVICE_NAME && name === API_SERVICE_NAME) || name === 'app' || name === 'backend' || name === 'web') {
                const { domain } = domains.serviceDomains?.[0];
                console.log('Domain:', domain)
                core.setOutput('service_domain', domain);
            }
        }

        // Redeploy the Services
        await redeployAllServices(environmentId, servicesToRedeploy);
    } catch (error) {
        console.error('Error in API calls:', error);
        // Handle the error, e.g., fail the action
        core.setFailed('API calls failed');
    }
}

run();