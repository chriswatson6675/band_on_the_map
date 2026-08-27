import { assertIsolatedResearchPaths } from "./contract.mjs";

const [productionPath, researchRoot, publicationPath] = process.argv.slice(2);
console.log(JSON.stringify(assertIsolatedResearchPaths({ productionPath, researchRoot, publicationPath })));
