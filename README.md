# scripts

A repo for prototyping small scripts.

## Process

### Script Format
All scripts are located in `./scripts` & each should have a header which describes the script's purpose and how to use it. For instance:

```
/*
 * This script is used to detect mismatched transactions between two nodes.
 * To use it simply make sure that the node's URLs are correctly set in your ENV.
*/
```

### Turn Scripts into Tests
Some scripts should actually be added to our [integration test suite](https://github.com/ethereum-optimism/integration-tests). For instance, the example script above could be very useful for sync service testing. If we notice a script that could be polished and added to the tests, we should label that script as `should be a test` & add it to our testing backlog.

```
/* [should be a test]
 * This script is used to detect mismatched transactions between two nodes.
 * To use it simply make sure that the node's URLs are correctly set in your ENV.
*/
```
