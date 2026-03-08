# Onchain Write
Source: https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/overview-ts
Last Updated: 2025-11-04


This overview explains how writing data onchain works in CRE and how the TypeScript SDK handles it.

- [Understanding how CRE writes work](#understanding-how-cre-writes-work) - The secure write flow
- [What you need: A consumer contract](#what-you-need-a-consumer-contract) - Contract requirements
- [The TypeScript write process](#the-typescript-write-process) - Two-step approach overview
- [Next steps](#next-steps) - Where to go from here

## Understanding how CRE writes work

Before diving into code, it's important to understand how CRE handles onchain writes differently than traditional web3 applications.

### Why CRE doesn't write directly to your contract

In a traditional web3 app, you'd create a transaction and send it directly to your smart contract. **CRE uses a different, more secure approach** for three key reasons:

1. **Decentralization**: Multiple nodes in the Decentralized Oracle Network (DON) need to agree on what data to write
2. **Verification**: The blockchain needs cryptographic proof that the data came from a trusted Chainlink network
3. **Accountability**: There must be a verifiable trail showing which workflow and owner created the data

### The secure write flow (4 steps)

Here's the journey your workflow's data takes to reach the blockchain:

1. **Report generation**: Your workflow generates a ***report***—your data is ABI-encoded and wrapped in a cryptographically signed "package"
2. **DON consensus**: The DON reaches consensus on the report's contents
3. **Forwarder submission**: A designated node submits the report to a Chainlink `KeystoneForwarder` contract
4. **Delivery to your contract**: The Forwarder validates the report's signatures and calls your consumer contract's `onReport()` function with the data

In your workflow code, this process involves two steps: calling `runtime.report()` to generate the signed report, then calling `evmClient.writeReport()` to submit it to the blockchain.

## What you need: A consumer contract

Before you can write data onchain, you need a **consumer contract**. This is the smart contract that will receive your workflow's data.

**What is a consumer contract?**

A consumer contract is **your smart contract** that implements the `IReceiver` interface. This interface defines an `onReport()` function that the Chainlink Forwarder calls to deliver your workflow's data.

Think of it as a mailbox that's designed to receive packages (reports) from Chainlink's secure delivery service (the Forwarder contract).

**Key requirement:**

Your contract must implement the `IReceiver` interface. This single requirement ensures your contract has the necessary `onReport(bytes metadata, bytes report)` function that the Chainlink Forwarder calls to deliver data.

**Getting started:**

- **Don't have a consumer contract yet?** Follow the [Building Consumer Contracts](/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts) guide to create one.
- **Already have one deployed?** Great! Make sure you have its address and ABI ready for encoding your data.

## The TypeScript write process

The TypeScript SDK uses a simple, two-step process for writing data onchain:

### Step 1: Generate a signed report

Use `runtime.report()` to:

1. ABI-encode your data using <a href="https://viem.sh/docs/abi/encodeAbiParameters" target="_blank">viem's `encodeAbiParameters()`</a>
2. Convert the encoded data to base64 format
3. Generate a cryptographically signed report

### Step 2: Submit the report

Use `evmClient.writeReport()` to submit the signed report to your consumer contract address.

**Key features:**

- **Use viem** directly for ABI operations
- **Manual but flexible** - Full control over encoding and submission
- **Type-safe** - TypeScript and viem ensure compile-time safety
- **Works for any data** - Single values, structs, arrays, etc.

> **NOTE: Already familiar with the Getting Started tutorial?**
>
> The approach covered in [Part 4: Writing Onchain](/cre/getting-started/part-4-writing-onchain) uses this same two-step
> pattern. This section provides the conceptual foundation for that tutorial.

## Next steps

Now that you understand the concepts, follow these guides to implement onchain writes:

1. **[Building Consumer Contracts](/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts)** - Create a Solidity contract to receive your workflow's data
2. **[Writing Data Onchain](/cre/guides/workflow/using-evm-client/onchain-write/writing-data-onchain)** - Complete step-by-step guide with examples for single values and structs

**Additional resources:**

- **[EVM Client Reference](/cre/reference/sdk/evm-client-ts)** - Complete API documentation
- **[Onchain Read](/cre/guides/workflow/using-evm-client/onchain-read-ts)** - Reading data from smart contracts

# Building Consumer Contracts
Source: https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts
Last Updated: 2026-02-03


When your workflow [writes data to the blockchain](/cre/guides/workflow/using-evm-client/onchain-write), it doesn't call your contract directly. Instead, it submits a signed report to a Chainlink `KeystoneForwarder` contract, which then calls your contract.

This guide explains how to build a consumer contract that can securely receive and process data from a CRE workflow.

**In this guide:**

1. [Core Concepts: The Onchain Data Flow](#1-core-concepts-the-onchain-data-flow)
2. [The IReceiver Standard](#2-the-ireceiver-standard)
3. [Using ReceiverTemplate](#3-using-receivertemplate)
4. [Working with Simulation](#4-working-with-simulation)
5. [Advanced Usage](#5-advanced-usage-optional)
6. [Complete Examples](#6-complete-examples)
7. [Security Considerations](#7-security-considerations)

## 1. Core Concepts: The Onchain Data Flow

1. **Workflow Execution**: Your workflow [produces a final, signed report](/cre/guides/workflow/using-evm-client/onchain-write/writing-data-onchain).
2. **EVM Write**: The EVM capability sends this report to the Chainlink-managed `KeystoneForwarder` contract.
3. **Forwarder Validation**: The `KeystoneForwarder` validates the report's signatures.
4. **Callback to Your Contract**: If the report is valid, the forwarder calls a designated function (`onReport`) on your consumer contract to deliver the data.

## 2. The `IReceiver` Standard

To be a valid target for the `KeystoneForwarder`, your consumer contract must satisfy two main requirements:

### 2.1 Implement the `IReceiver` Interface

The `KeystoneForwarder` needs a standardized function to call. This is defined by the `IReceiver` interface, which mandates an `onReport` function.

```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "./IERC165.sol";

/// @title IReceiver - receives keystone reports
/// @notice Implementations must support the IReceiver interface through ERC165.
interface IReceiver is IERC165 {
  /// @notice Handles incoming keystone reports.
  /// @dev If this function call reverts, it can be retried with a higher gas
  /// limit. The receiver is responsible for discarding stale reports.
  /// @param metadata Report's metadata.
  /// @param report Workflow report.
  function onReport(
    bytes calldata metadata,
    bytes calldata report
  ) external;
}
```

- `metadata`: Contains information about the workflow (ID, name, owner). This is encoded by the Forwarder using `abi.encodePacked` with the following structure: `bytes32 workflowId`, `bytes10 workflowName`, `address workflowOwner`.
- `report`: The raw, ABI-encoded data payload from your workflow.

### 2.2 Support ERC165 Interface Detection

[ERC165](https://eips.ethereum.org/EIPS/eip-165) is a standard that allows contracts to publish the interfaces they support. The `KeystoneForwarder` uses this to check if your contract supports the `IReceiver` interface before sending a report.

Link to the `IERC165` interface: [IERC165.sol](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/introspection/IERC165.sol)

## 3. Using `ReceiverTemplate`

### 3.1 Overview

While you can implement these standards manually, we provide an abstract contract, `ReceiverTemplate.sol`, that does the heavy lifting for you. Inheriting from it is the recommended best practice.

**Key features:**

- **Secure by Default**: Requires forwarder address at deployment, ensuring your contract is protected from the start
- **Layered Security**: Add optional workflow ID validation, workflow owner verification, or any combination for defense-in-depth
- **Flexible Configuration**: All permission settings can be updated via setter functions after deployment
- **Simplified Logic**: You only need to implement `_processReport(bytes calldata report)` with your business logic
- **Built-in Access Control**: Includes OpenZeppelin's `Ownable` for secure permission management
- **ERC165 Support**: Includes the necessary `supportsInterface` function
- **Metadata Access**: Helper function to decode workflow ID, name, and owner for custom validation logic

### 3.2 Contract Source Code

```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "./IERC165.sol";
import {IReceiver} from "./IReceiver.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ReceiverTemplate - Abstract receiver with optional permission controls
/// @notice Provides flexible, updatable security checks for receiving workflow reports
/// @dev The forwarder address is required at construction time for security.
///      Additional permission fields can be configured using setter functions.
abstract contract ReceiverTemplate is IReceiver, Ownable {
  // Required permission field at deployment, configurable after
  address private s_forwarderAddress; // If set, only this address can call onReport

  // Optional permission fields (all default to zero = disabled)
  address private s_expectedAuthor; // If set, only reports from this workflow owner are accepted
  bytes10 private s_expectedWorkflowName; // Only validated when s_expectedAuthor is also set
  bytes32 private s_expectedWorkflowId; // If set, only reports from this specific workflow ID are accepted

  // Hex character lookup table for bytes-to-hex conversion
  bytes private constant HEX_CHARS = "0123456789abcdef";

  // Custom errors
  error InvalidForwarderAddress();
  error InvalidSender(address sender, address expected);
  error InvalidAuthor(address received, address expected);
  error InvalidWorkflowName(bytes10 received, bytes10 expected);
  error InvalidWorkflowId(bytes32 received, bytes32 expected);
  error WorkflowNameRequiresAuthorValidation();

  // Events
  event ForwarderAddressUpdated(address indexed previousForwarder, address indexed newForwarder);
  event ExpectedAuthorUpdated(address indexed previousAuthor, address indexed newAuthor);
  event ExpectedWorkflowNameUpdated(bytes10 indexed previousName, bytes10 indexed newName);
  event ExpectedWorkflowIdUpdated(bytes32 indexed previousId, bytes32 indexed newId);
  event SecurityWarning(string message);

  /// @notice Constructor sets msg.sender as the owner and configures the forwarder address
  /// @param _forwarderAddress The address of the Chainlink Forwarder contract (cannot be address(0))
  /// @dev The forwarder address is required for security - it ensures only verified reports are processed
  constructor(
    address _forwarderAddress
  ) Ownable(msg.sender) {
    if (_forwarderAddress == address(0)) {
      revert InvalidForwarderAddress();
    }
    s_forwarderAddress = _forwarderAddress;
    emit ForwarderAddressUpdated(address(0), _forwarderAddress);
  }

  /// @notice Returns the configured forwarder address
  /// @return The forwarder address (address(0) if disabled)
  function getForwarderAddress() external view returns (address) {
    return s_forwarderAddress;
  }

  /// @notice Returns the expected workflow author address
  /// @return The expected author address (address(0) if not set)
  function getExpectedAuthor() external view returns (address) {
    return s_expectedAuthor;
  }

  /// @notice Returns the expected workflow name
  /// @return The expected workflow name (bytes10(0) if not set)
  function getExpectedWorkflowName() external view returns (bytes10) {
    return s_expectedWorkflowName;
  }

  /// @notice Returns the expected workflow ID
  /// @return The expected workflow ID (bytes32(0) if not set)
  function getExpectedWorkflowId() external view returns (bytes32) {
    return s_expectedWorkflowId;
  }

  /// @inheritdoc IReceiver
  /// @dev Performs optional validation checks based on which permission fields are set
  function onReport(
    bytes calldata metadata,
    bytes calldata report
  ) external override {
    // Security Check 1: Verify caller is the trusted Chainlink Forwarder (if configured)
    if (s_forwarderAddress != address(0) && msg.sender != s_forwarderAddress) {
      revert InvalidSender(msg.sender, s_forwarderAddress);
    }

    // Security Checks 2-4: Verify workflow identity - ID, owner, and/or name (if any are configured)
    if (s_expectedWorkflowId != bytes32(0) || s_expectedAuthor != address(0) || s_expectedWorkflowName != bytes10(0)) {
      (bytes32 workflowId, bytes10 workflowName, address workflowOwner) = _decodeMetadata(metadata);

      if (s_expectedWorkflowId != bytes32(0) && workflowId != s_expectedWorkflowId) {
        revert InvalidWorkflowId(workflowId, s_expectedWorkflowId);
      }
      if (s_expectedAuthor != address(0) && workflowOwner != s_expectedAuthor) {
        revert InvalidAuthor(workflowOwner, s_expectedAuthor);
      }

      // ================================================================
      // WORKFLOW NAME VALIDATION - REQUIRES AUTHOR VALIDATION
      // ================================================================
      // Do not rely on workflow name validation alone. Workflow names are unique
      // per owner, but not across owners.
      // Furthermore, workflow names use 40-bit truncation (bytes10), making collisions possible.
      // Therefore, workflow name validation REQUIRES author (workflow owner) validation.
      // The code enforces this dependency at runtime.
      // ================================================================
      if (s_expectedWorkflowName != bytes10(0)) {
        // Author must be configured if workflow name is used
        if (s_expectedAuthor == address(0)) {
          revert WorkflowNameRequiresAuthorValidation();
        }
        // Validate workflow name matches (author already validated above)
        if (workflowName != s_expectedWorkflowName) {
          revert InvalidWorkflowName(workflowName, s_expectedWorkflowName);
        }
      }
    }

    _processReport(report);
  }

  /// @notice Updates the forwarder address that is allowed to call onReport
  /// @param _forwarder The new forwarder address
  /// @dev WARNING: Setting to address(0) disables forwarder validation.
  ///      This makes your contract INSECURE - anyone can call onReport() with arbitrary data.
  ///      Only use address(0) if you fully understand the security implications.
  function setForwarderAddress(
    address _forwarder
  ) external onlyOwner {
    address previousForwarder = s_forwarderAddress;

    // Emit warning if disabling forwarder check
    if (_forwarder == address(0)) {
      emit SecurityWarning("Forwarder address set to zero - contract is now INSECURE");
    }

    s_forwarderAddress = _forwarder;
    emit ForwarderAddressUpdated(previousForwarder, _forwarder);
  }

  /// @notice Updates the expected workflow owner address
  /// @param _author The new expected author address (use address(0) to disable this check)
  function setExpectedAuthor(
    address _author
  ) external onlyOwner {
    address previousAuthor = s_expectedAuthor;
    s_expectedAuthor = _author;
    emit ExpectedAuthorUpdated(previousAuthor, _author);
  }

  /// @notice Updates the expected workflow name from a plaintext string
  /// @param _name The workflow name as a string (use empty string "" to disable this check)
  /// @dev IMPORTANT: Workflow name validation REQUIRES author validation to be enabled.
  ///      The workflow name uses only 40-bit truncation, making collision attacks feasible
  ///      when used alone. However, since workflow names are unique per owner, validating
  ///      both the name AND the author address provides adequate security.
  ///      You must call setExpectedAuthor() before or after calling this function.
  ///      The name is hashed using SHA256 and truncated to bytes10.
  function setExpectedWorkflowName(
    string calldata _name
  ) external onlyOwner {
    bytes10 previousName = s_expectedWorkflowName;

    if (bytes(_name).length == 0) {
      s_expectedWorkflowName = bytes10(0);
      emit ExpectedWorkflowNameUpdated(previousName, bytes10(0));
      return;
    }

    // Convert workflow name to bytes10:
    // SHA256 hash → hex encode → take first 10 chars → hex encode those chars
    bytes32 hash = sha256(bytes(_name));
    bytes memory hexString = _bytesToHexString(abi.encodePacked(hash));
    bytes memory first10 = new bytes(10);
    for (uint256 i = 0; i < 10; i++) {
      first10[i] = hexString[i];
    }
    s_expectedWorkflowName = bytes10(first10);
    emit ExpectedWorkflowNameUpdated(previousName, s_expectedWorkflowName);
  }

  /// @notice Updates the expected workflow ID
  /// @param _id The new expected workflow ID (use bytes32(0) to disable this check)
  function setExpectedWorkflowId(
    bytes32 _id
  ) external onlyOwner {
    bytes32 previousId = s_expectedWorkflowId;
    s_expectedWorkflowId = _id;
    emit ExpectedWorkflowIdUpdated(previousId, _id);
  }

  /// @notice Helper function to convert bytes to hex string
  /// @param data The bytes to convert
  /// @return The hex string representation
  function _bytesToHexString(
    bytes memory data
  ) private pure returns (bytes memory) {
    bytes memory hexString = new bytes(data.length * 2);

    for (uint256 i = 0; i < data.length; i++) {
      hexString[i * 2] = HEX_CHARS[uint8(data[i] >> 4)];
      hexString[i * 2 + 1] = HEX_CHARS[uint8(data[i] & 0x0f)];
    }

    return hexString;
  }

  /// @notice Extracts all metadata fields from the onReport metadata parameter
  /// @param metadata The metadata bytes encoded using abi.encodePacked(workflowId, workflowName, workflowOwner)
  /// @return workflowId The unique identifier of the workflow (bytes32)
  /// @return workflowName The name of the workflow (bytes10)
  /// @return workflowOwner The owner address of the workflow
  function _decodeMetadata(
    bytes memory metadata
  ) internal pure returns (bytes32 workflowId, bytes10 workflowName, address workflowOwner) {
    // Metadata structure (encoded using abi.encodePacked by the Forwarder):
    // - First 32 bytes: length of the byte array (standard for dynamic bytes)
    // - Offset 32, size 32: workflow_id (bytes32)
    // - Offset 64, size 10: workflow_name (bytes10)
    // - Offset 74, size 20: workflow_owner (address)
    assembly {
      workflowId := mload(add(metadata, 32))
      workflowName := mload(add(metadata, 64))
      workflowOwner := shr(mul(12, 8), mload(add(metadata, 74)))
    }
    return (workflowId, workflowName, workflowOwner);
  }

  /// @notice Abstract function to process the report data
  /// @param report The report calldata containing your workflow's encoded data
  /// @dev Implement this function with your contract's business logic
  function _processReport(
    bytes calldata report
  ) internal virtual;

  /// @inheritdoc IERC165
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override returns (bool) {
    return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
  }
}
```

### 3.3 Quick Start

The simplest way to use `ReceiverTemplate` is to inherit from it and implement the `_processReport` function:

```sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {ReceiverTemplate} from "./ReceiverTemplate.sol";

contract MyConsumer is ReceiverTemplate {
  uint256 public s_storedValue;
  event ValueUpdated(uint256 newValue);

  // Constructor requires forwarder address
  constructor(
    address _forwarderAddress
  ) ReceiverTemplate(_forwarderAddress) {}

  // Implement your business logic here
  function _processReport(
    bytes calldata report
  ) internal override {
    uint256 newValue = abi.decode(report, (uint256));
    s_storedValue = newValue;
    emit ValueUpdated(newValue);
  }
}
```

### 3.4 Configuring Permissions

The forwarder address is configured at deployment via the constructor and provides your first line of defense. After deploying your contract, the owner can configure additional security checks or update the forwarder address if needed.

> **CAUTION: For simulation**
>
> When using `cre workflow simulate`, **do not configure metadata-based validation checks** (`setExpectedWorkflowId`, `setExpectedAuthor`, `setExpectedWorkflowName`). The simulation uses a `MockForwarder` that doesn't provide this metadata. See [Working with Simulation](#4-working-with-simulation) for details.

> **TIP: Finding forwarder addresses**
>
> For a complete list of `KeystoneForwarder` and `MockForwarder` contract addresses on all supported networks, see [Forwarder Directory](/cre/guides/workflow/using-evm-client/forwarder-directory).

**Configuration examples:**

```solidity
// Example: Update forwarder address (e.g., when moving from simulation to production)
myConsumer.setForwarderAddress(0xF8344CFd5c43616a4366C34E3EEE75af79a74482); // Ethereum Sepolia KeystoneForwarder

// Example: Add workflow ID check for additional security
myConsumer.setExpectedWorkflowId(0x1234...); // Your specific workflow ID

// Example: Add workflow owner check
myConsumer.setExpectedAuthor(0xYourAddress...);

// Example: Add workflow name check (requires author validation to be set)
myConsumer.setExpectedWorkflowName("my_workflow");

// Example: Disable a check later
myConsumer.setExpectedWorkflowName(""); // Empty string disables the check
```

> **TIP: Recommended production setup**
>
> The forwarder address is required at deployment and provides basic security. For production contracts, we strongly recommend adding additional validation:

- Use `setExpectedWorkflowId()` if only one workflow writes to your contract (highest security)
- Use `setExpectedAuthor()` if multiple workflows from the same owner write to your contract

**What the template handles for you:**

- Validates the caller address against the configured forwarder (required at deployment)
- Validates the workflow ID (if `expectedWorkflowId` is configured)
- Validates the workflow owner (if `expectedAuthor` is configured)
- Validates the workflow name (if both `expectedWorkflowName` AND `expectedAuthor` are configured)
- Implements ERC165 interface detection
- Provides access control via OpenZeppelin's `Ownable`
- Calls your `_processReport` function with validated data

**What you implement:**

- Pass the forwarder address to the constructor during deployment
- Your business logic in `_processReport`
- (Optional) Configure additional permissions after deployment using setter functions

#### How workflow names are encoded

The `workflowName` field in the metadata uses the **`bytes10`** type rather than plaintext strings. When you call `setExpectedWorkflowName("my_workflow")`, the `ReceiverTemplate` automatically encodes it using the same algorithm as the CRE engine:

1. Compute SHA256 hash of the workflow name
2. Convert hash to hex string (64 characters)
3. Take the first 10 hex characters (e.g., `"b76f3ae1de"`)
4. Hex-encode those 10 ASCII characters to get `bytes10` (20 hex characters / 10 bytes)

**Example:** `"my_workflow"` → SHA256 → `"b76f3ae1de..."` → hex-encode → `0x62373666336165316465`

This encoding ensures consistent, fixed-size representation regardless of the original workflow name length.

> **CAUTION: Workflow name validation requires author validation**
>
> Workflow name validation is **only performed when author validation is also configured**. The code enforces this at runtime: if you set `expectedWorkflowName`, you must also set `expectedAuthor`, otherwise the validation will revert with `WorkflowNameRequiresAuthorValidation()`. This prevents the 40-bit collision attack by ensuring workflow names are validated in combination with the owner address. See [Security Considerations](#7-security-considerations) for details.

**Usage:**

```solidity
// Set the expected author first (required)
myConsumer.setExpectedAuthor(0xYourAddress...);

// Then set the expected workflow name (only works with author validation)
myConsumer.setExpectedWorkflowName("my_workflow");

// To disable the workflow name check
myConsumer.setExpectedWorkflowName(""); // Empty string clears the stored value
```

## 4. Working with Simulation

When you run `cre workflow simulate`, your workflow interacts with a **`MockKeystoneForwarder`** contract that does not provide workflow metadata (`workflow_name`, `workflow_owner`).

> **CAUTION: Temporary limitation**
>
> This is a **temporary limitation** until the `MockKeystoneForwarder` is updated to provide full metadata.

### Deploying for Simulation

When deploying your consumer contract for simulation, pass the **Mock Forwarder address** to the constructor:

```solidity
// Deploy with MockForwarder address for Ethereum Sepolia simulation
address mockForwarder = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88; // Ethereum Sepolia MockForwarder
MyConsumer myConsumer = new MyConsumer(mockForwarder);
```

Find Mock Forwarder addresses for all networks in the [Forwarder Directory](/cre/guides/workflow/using-evm-client/forwarder-directory) page.

> **CAUTION: Important: Different addresses for simulation vs production**
>
> The `MockKeystoneForwarder` address used during simulation is **different** from the `KeystoneForwarder` address used by deployed workflows. After testing with simulation, deploy a new instance with the production `KeystoneForwarder` address, or update the forwarder address using `setForwarderAddress()`. See [Forwarder Directory](/cre/guides/workflow/using-evm-client/forwarder-directory) for forwarder addresses.

### Metadata-based validation

**Do not configure these validation checks** during simulation - they require metadata that `MockKeystoneForwarder` doesn't provide:

- `setExpectedWorkflowId()`
- `setExpectedAuthor()`
- `setExpectedWorkflowName()`

Setting any of these will cause your simulation to fail.

### Transitioning to Production

Once you're ready to deploy your workflow to production:

**Option 1: Deploy a new contract instance**

```solidity
// Deploy with production KeystoneForwarder address
address keystoneForwarder = 0xF8344CFd5c43616a4366C34E3EEE75af79a74482; // Ethereum Sepolia
MyConsumer myConsumer = new MyConsumer(keystoneForwarder);

// Configure additional security checks
myConsumer.setExpectedWorkflowId(0xYourWorkflowId);
```

**Option 2: Update existing contract's forwarder**

```solidity
// Update forwarder to production KeystoneForwarder
myConsumer.setForwarderAddress(0xF8344CFd5c43616a4366C34E3EEE75af79a74482); // Ethereum Sepolia

// Add metadata-based validation
myConsumer.setExpectedWorkflowId(0xYourWorkflowId);
```

See [Configuring Permissions](#34-configuring-permissions) for complete details.

## 5. Advanced Usage (Optional)

### 5.1 Custom Validation Logic

You can override `onReport` to add your own validation logic before or after the standard checks:

```solidity
import { ReceiverTemplate } from "./ReceiverTemplate.sol";

contract AdvancedConsumer is ReceiverTemplate {
  uint256 private s_minReportInterval = 1 hours;
  uint256 private s_lastReportTime;

  error ReportTooFrequent(uint256 timeSinceLastReport, uint256 minInterval);

  event MinReportIntervalUpdated(uint256 previousInterval, uint256 newInterval);

  constructor(address _forwarderAddress) ReceiverTemplate(_forwarderAddress) {}

  // Add custom validation before parent's checks
  function onReport(bytes calldata metadata, bytes calldata report) external override {
    // Custom check: Rate limiting
    if (block.timestamp < s_lastReportTime + s_minReportInterval) {
      revert ReportTooFrequent(block.timestamp - s_lastReportTime, s_minReportInterval);
    }

    // Call parent implementation for standard permission checks
    super.onReport(metadata, report);

    s_lastReportTime = block.timestamp;
  }

  function _processReport(bytes calldata report) internal override {
    // Your business logic here
    uint256 value = abi.decode(report, (uint256));
    // ... store or process the value ...
  }

  /// @notice Returns the minimum interval between reports
  /// @return The minimum interval in seconds
  function getMinReportInterval() external view returns (uint256) {
    return s_minReportInterval;
  }

  /// @notice Returns the timestamp of the last report
  /// @return The last report timestamp
  function getLastReportTime() external view returns (uint256) {
    return s_lastReportTime;
  }

  /// @notice Updates the minimum interval between reports
  /// @param _interval The new minimum interval in seconds
  function setMinReportInterval(uint256 _interval) external onlyOwner {
    uint256 previousInterval = s_minReportInterval;
    s_minReportInterval = _interval;
    emit MinReportIntervalUpdated(previousInterval, _interval);
  }
}
```

### 5.2 Using Metadata Fields in Your Logic

The `_decodeMetadata` helper function is available for use in your `_processReport` implementation. This allows you to access workflow metadata for custom business logic:

```solidity
contract MetadataAwareConsumer is ReceiverTemplate {
  mapping(bytes32 => uint256) public s_reportCountByWorkflow;

  constructor(address _forwarderAddress) ReceiverTemplate(_forwarderAddress) {}

  function _processReport(bytes calldata report) internal override {
    // Access the metadata to get workflow ID
    bytes calldata metadata = msg.data[4:]; // Skip function selector
    (bytes32 workflowId, , ) = _decodeMetadata(metadata);

    // Use workflow ID in your business logic
    s_reportCountByWorkflow[workflowId]++;

    // Process the report data
    uint256 value = abi.decode(report, (uint256));
    // ... your logic here ...
  }
}
```

> **NOTE: Advanced access control**
>
> For production systems requiring even more sophisticated access control (such as role-based permissions or two-step ownership transfer), consider extending the template to use OpenZeppelin's `AccessControl` instead of `Ownable`, or implementing a custom ownership transfer pattern.

## 6. Complete Examples

### Example 1: Simple Consumer Contract

This example inherits from `ReceiverTemplate` to store a temperature value.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import { ReceiverTemplate } from "./ReceiverTemplate.sol";

contract TemperatureConsumer is ReceiverTemplate {
  int256 public s_currentTemperature;
  event TemperatureUpdated(int256 newTemperature);

  // Constructor requires forwarder address
  constructor(address _forwarderAddress) ReceiverTemplate(_forwarderAddress) {}

  function _processReport(bytes calldata report) internal override {
    int256 newTemperature = abi.decode(report, (int256));
    s_currentTemperature = newTemperature;
    emit TemperatureUpdated(newTemperature);
  }
}
```

**Deployment:**

```solidity
// For simulation: Use MockForwarder address
address mockForwarder = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88; // e.g. Ethereum Sepolia
TemperatureConsumer temperatureConsumer = new TemperatureConsumer(mockForwarder);

// For production: Use KeystoneForwarder address
address keystoneForwarder = 0xF8344CFd5c43616a4366C34E3EEE75af79a74482; // e.g. Ethereum Sepolia
TemperatureConsumer temperatureConsumer = new TemperatureConsumer(keystoneForwarder);
```

**Adding additional security after deployment:**

```solidity
// Add workflow ID check for highest security
temperatureConsumer.setExpectedWorkflowId(0xYourWorkflowId...);
```

### Example 2: The Proxy Pattern

For more complex scenarios, it's best to separate your Chainlink-aware code from your core business logic. The **Proxy Pattern** is a robust architecture that uses two contracts to achieve this:

- **A Logic Contract**: Holds the state and the core functions of your application. It knows nothing about the Forwarder contract or the `onReport` function.
- **A Proxy Contract**: Acts as the secure entry point. It inherits from `ReceiverTemplate` and forwards validated reports to the Logic Contract.

This separation makes your business logic more modular and reusable.

#### The Logic Contract (`ReserveManager.sol`)

This contract, our "vault", holds the state and the `updateReserves` function. For security, it only accepts calls from its trusted Proxy. It also includes an owner-only function to update the proxy address, making the system upgradeable without requiring a migration.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract ReserveManager is Ownable {
  struct UpdateReserves {
    uint256 ethPrice;
    uint256 btcPrice;
  }

  address private s_proxyAddress;
  uint256 private s_lastEthPrice;
  uint256 private s_lastBtcPrice;
  uint256 private s_lastUpdateTime;

  event ReservesUpdated(uint256 ethPrice, uint256 btcPrice, uint256 updateTime);
  event ProxyAddressUpdated(address indexed previousProxy, address indexed newProxy);

  modifier onlyProxy() {
    require(msg.sender == s_proxyAddress, "Caller is not the authorized proxy");
    _;
  }

  constructor() Ownable(msg.sender) {}

  /// @notice Returns the proxy address
  /// @return The authorized proxy address
  function getProxyAddress() external view returns (address) {
    return s_proxyAddress;
  }

  /// @notice Returns the last ETH price
  /// @return The last recorded ETH price
  function getLastEthPrice() external view returns (uint256) {
    return s_lastEthPrice;
  }

  /// @notice Returns the last BTC price
  /// @return The last recorded BTC price
  function getLastBtcPrice() external view returns (uint256) {
    return s_lastBtcPrice;
  }

  /// @notice Returns the last update timestamp
  /// @return The timestamp of the last update
  function getLastUpdateTime() external view returns (uint256) {
    return s_lastUpdateTime;
  }

  /// @notice Updates the authorized proxy address
  /// @param _proxyAddress The new proxy address
  function setProxyAddress(address _proxyAddress) external onlyOwner {
    address previousProxy = s_proxyAddress;
    s_proxyAddress = _proxyAddress;
    emit ProxyAddressUpdated(previousProxy, _proxyAddress);
  }

  /// @notice Updates the reserve prices
  /// @param data The new reserve data containing ETH and BTC prices
  function updateReserves(UpdateReserves memory data) external onlyProxy {
    s_lastEthPrice = data.ethPrice;
    s_lastBtcPrice = data.btcPrice;
    s_lastUpdateTime = block.timestamp;
    emit ReservesUpdated(data.ethPrice, data.btcPrice, block.timestamp);
  }
}
```

#### The Proxy Contract (`UpdateReservesProxy.sol`)

This contract, our "bouncer", is the only contract that interacts with the Chainlink platform. It inherits `ReceiverTemplate` to validate incoming reports and then calls the `ReserveManager`.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { ReserveManager } from "./ReserveManager.sol";
import { ReceiverTemplate } from "./ReceiverTemplate.sol";

contract UpdateReservesProxy is ReceiverTemplate {
  ReserveManager private s_reserveManager;

  constructor(address _forwarderAddress, address reserveManagerAddress) ReceiverTemplate(_forwarderAddress) {
    s_reserveManager = ReserveManager(reserveManagerAddress);
  }

  /// @notice Returns the reserve manager contract address
  /// @return The ReserveManager contract instance
  function getReserveManager() external view returns (ReserveManager) {
    return s_reserveManager;
  }

  /// @inheritdoc ReceiverTemplate
  function _processReport(bytes calldata report) internal override {
    ReserveManager.UpdateReserves memory updateReservesData = abi.decode(report, (ReserveManager.UpdateReserves));
    s_reserveManager.updateReserves(updateReservesData);
  }
}
```

**Configuring permissions after deployment:**

```solidity
// Additional validation can be added after deployment
updateReservesProxy.setExpectedWorkflowId(0xYourWorkflowId...);
```

> **NOTE: KeystoneForwarder address shown**
>
> The examples above use the Ethereum Sepolia forwarder address. For other networks, see [Forwarder Directory](/cre/guides/workflow/using-evm-client/forwarder-directory).

#### How it Works

The deployment and configuration process involves these steps:

1. **Deploy the Logic Contract**: Deploy `ReserveManager.sol`. The wallet that deploys this contract becomes its `owner`.
2. **Deploy the Proxy Contract**: Deploy `UpdateReservesProxy.sol`, passing the forwarder address and the address of the deployed `ReserveManager` contract to its constructor.
3. **Link the Contracts**: The `owner` of the `ReserveManager` contract must call its `setProxyAddress` function, passing in the address of the `UpdateReservesProxy` contract. This authorizes the proxy to call the logic contract.
4. **Configure Permissions** (Recommended): The `owner` of the proxy should call setter functions to enable security checks:
   ```solidity
   updateReservesProxy.setForwarderAddress(0xF8344CFd5c43616a4366C34E3EEE75af79a74482);
   updateReservesProxy.setExpectedWorkflowId(0xYourWorkflowId...);
   ```
5. **Configure Workflow**: In your workflow's `config.json`, use the address of the **Proxy Contract** as the receiver address.
6. **Execution Flow**: When your workflow runs:
   - The Chainlink Forwarder calls `onReport` on your **Proxy**
   - The Proxy validates the report (forwarder address is verified automatically; additional checks like workflow ID can be added)
   - The Proxy's `_processReport` function calls the `updateReserves` function on your **Logic Contract**
   - Because the caller is the trusted proxy, the `onlyProxy` check passes, and your state is securely updated
7. **(Optional) Upgrade**: If you later need to deploy a new proxy, the owner can:
   - Deploy the new proxy contract with the appropriate forwarder address
   - Call `setProxyAddress` on the `ReserveManager` to point it to the new proxy's address
   - Update the workflow configuration to use the new proxy address

#### End-to-End Sequence

(Image: Image)

## 7. Security Considerations

### Forwarder address

**The forwarder address is the foundation of your contract's security.** The `KeystoneForwarder` contract performs cryptographic verification of DON signatures before calling your consumer. By requiring the forwarder address in the constructor, `ReceiverTemplate` ensures your contract is secure from deployment.

> **CAUTION: Never set forwarder to address(0) in production**
>
> While the `setForwarderAddress()` function allows updating to `address(0)`, this disables the critical security check and allows **anyone** to call your `onReport()` function with arbitrary data. The function emits a `SecurityWarning` event if you attempt this. Only use `address(0)` for testing if you fully understand the implications.

### Replay protection

The `KeystoneForwarder` contract includes built-in replay protection that prevents successful reports from being executed multiple times. By requiring the forwarder address at construction time, `ReceiverTemplate` ensures your consumer benefits from this protection automatically.

> **NOTE: Failed reports can be retried**
>
> If a report fails (reverts), the forwarder's replay protection allows it to be retried. This is safe because reverts undo all state changes, ensuring no duplicate effects occur in your contract.

### Additional validation layers

The forwarder address provides baseline security, but you can add additional validation for defense-in-depth:

- **`expectedWorkflowId`**: Ensures only one specific workflow can update your contract. Use this when a single workflow writes to your consumer (highest security for single-workflow scenarios).
- **`expectedAuthor`**: Restricts to workflows owned by a specific address. Use this when multiple workflows from the same owner should access your contract.
- **`expectedWorkflowName`**: Can be used in combination with `expectedAuthor` for additional validation. Requires author validation to be configured. See [Workflow name validation](#workflow-name-validation) below.

### Workflow name validation

> **CAUTION: Workflow name validation requires author validation**
>
> The `expectedWorkflowName` check in `ReceiverTemplate.onReport()` **requires author validation** to be configured:

- **Collision Risk**: Workflow names use only 40-bit truncation (bytes10), making collision attacks computationally feasible when used alone
- **Unique per owner**: Workflow names are unique per owner but not across different owners
- **Runtime enforcement**: The code enforces that if `expectedWorkflowName` is set, `expectedAuthor` must also be set, otherwise it reverts with `WorkflowNameRequiresAuthorValidation()`

By combining workflow name (40-bit) with author validation (160-bit address), the contract achieves adequate collision resistance. You can safely use workflow name validation as long as author validation is also enabled.

### Best practices

1. **Always deploy with a valid forwarder address** - The constructor requires this for security. Use `MockForwarder` for simulation, `KeystoneForwarder` for production. Forwarder addresses are available in the [Forwarder Directory](/cre/guides/workflow/using-evm-client/forwarder-directory) page.
2. **Add additional validation for production**:
   - **Single workflow**: Use `setExpectedWorkflowId()` to restrict to one specific workflow (highest security)
   - **Multiple workflows from same owner**: Use `setExpectedAuthor()` to restrict to workflows you own
   - **Multiple workflows from different owners**: Implement custom validation logic in your `onReport()` override
3. **Keep your owner key secure** - The owner can update all permission settings
4. **Test permission configurations** - Verify your security settings work as expected before production deployment
5. **Workflow name validation** - Can be used with `setExpectedWorkflowName()` but requires `setExpectedAuthor()` to also be configured for security

# Forwarder Directory
Source: https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts
Last Updated: 2026-02-16


> **NOTE: Looking for supported networks?**
>
> For a complete list of supported networks and version requirements, see [Supported Networks](/cre/supported-networks).

This page lists forwarder contract addresses for CRE workflows, organized by network.

## How to Use This Page

This reference provides three key pieces of information for each network:

1. **Network Name**: The human-readable network identifier (click to view the forwarder contract on the block explorer)
2. **Chain Name**: The value to use in your [`project.yaml`](/cre/reference/project-configuration-ts#31-global-configuration-projectyaml) configuration and [EVM Client code](/cre/reference/sdk/evm-client-ts#chain-selectors)
3. **Forwarder Address**: The contract address for optional consumer contract validation

## Understanding Forwarder Addresses

Forwarder addresses identify the trusted Chainlink Forwarder contract that delivers verified workflow reports to your consumer contract. Your workflow code does not interact with forwarders directly—the EVM capability handles report delivery automatically. Learn more: [Onchain Write Overview](/cre/guides/workflow/using-evm-client/onchain-write/overview-ts).

**Using the [ReceiverTemplate](/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts#3-using-receivertemplate) (recommended)**: If you use the [`ReceiverTemplate`](/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts#receivertemplate), the forwarder address is **required** in the constructor. This ensures your contract only accepts reports from the trusted Chainlink Forwarder.

**Custom implementations**: If you implement the `IReceiver` interface directly without using `ReceiverTemplate`, you control your own security checks. See [Building Consumer Contracts](/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts) for details.

### Simulation vs Production Addresses

**Important**: Forwarder contracts differ between local simulation and production:

| Environment      | Contract Type           | Section                                         |
| ---------------- | ----------------------- | ----------------------------------------------- |
| Local simulation | `MockKeystoneForwarder` | [Simulation Forwarders](#simulation-forwarders) |
| Production       | `KeystoneForwarder`     | [Production Forwarders](#production-forwarders) |

If you configure forwarder validation in your consumer contract, **remember to update the forwarder address** when deploying to production. Learn more: [Working with Simulation](/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts#4-working-with-simulation).

## Simulation Forwarders

These `MockKeystoneForwarder` addresses are used when running `cre workflow simulate` with the `--broadcast` flag. Use these addresses **only** during local development and testing.

### Simulation Mainnets

| Network                                                                                                                                               | Chain Name                    | Mock Forwarder Address                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------ |
| <a href="https://arbiscan.io/address/0xd770499057619c9a76205fd4168161cf94abc532" target="_blank" rel="noopener noreferrer">Arbitrum One</a>           | ethereum-mainnet-arbitrum-1   | 0xd770499057619c9a76205fd4168161cf94abc532 |
| <a href="https://snowscan.xyz/address/0xdc21e279934ff6721cadfdd112dafb3261f09a2c" target="_blank" rel="noopener noreferrer">Avalanche</a>             | avalanche-mainnet             | 0xdc21e279934ff6721cadfdd112dafb3261f09a2c |
| <a href="https://basescan.org/address/0x5e342a8438b4f5d39e72875fcee6f76b39cce548" target="_blank" rel="noopener noreferrer">Base</a>                  | ethereum-mainnet-base-1       | 0x5e342a8438b4f5d39e72875fcee6f76b39cce548 |
| <a href="https://bscscan.com/address/0x6f3239bbb26e98961e1115aba83f8a282e5508c8" target="_blank" rel="noopener noreferrer">BNB Smart Chain</a>        | binance\_smart\_chain-mainnet | 0x6f3239bbb26e98961e1115aba83f8a282e5508c8 |
| <a href="https://etherscan.io/address/0xa3d1ad4ac559a6575a114998affb2fb2ec97a7d9" target="_blank" rel="noopener noreferrer">Ethereum Mainnet</a>      | ethereum-mainnet              | 0xa3d1ad4ac559a6575a114998affb2fb2ec97a7d9 |
| <a href="https://optimistic.etherscan.io/address/0x9119a1501550ed94a3f2794038ed9258337afa18" target="_blank" rel="noopener noreferrer">OP Mainnet</a> | ethereum-mainnet-optimism-1   | 0x9119a1501550ed94a3f2794038ed9258337afa18 |
| <a href="https://polygonscan.com/address/0xf458d621885e29a5003ea9bbba5280d54e19b1ce" target="_blank" rel="noopener noreferrer">Polygon</a>            | polygon-mainnet               | 0xf458d621885e29a5003ea9bbba5280d54e19b1ce |
| <a href="https://worldscan.org/address/0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1" target="_blank" rel="noopener noreferrer">World Chain</a>          | ethereum-mainnet-worldchain-1 | 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1 |
| <a href="https://explorer.zksync.io/address/0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1" target="_blank" rel="noopener noreferrer">ZKSync Era</a>      | ethereum-mainnet-zksync-1     | 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1 |

### Simulation Testnets

| Network                                                                                                                                                          | Chain Name                            | Mock Forwarder Address                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------ |
| <a href="https://explorer.curtis.apechain.com/address/0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1" target="_blank" rel="noopener noreferrer">Apechain Curtis</a>  | apechain-testnet-curtis               | 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1 |
| <a href="https://testnet.arcscan.app/address/0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1" target="_blank" rel="noopener noreferrer">Arc Testnet</a>               | arc-testnet                           | 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1 |
| <a href="https://sepolia.arbiscan.io/address/0xd41263567ddfead91504199b8c6c87371e83ca5d" target="_blank" rel="noopener noreferrer">Arbitrum Sepolia</a>          | ethereum-testnet-sepolia-arbitrum-1   | 0xd41263567ddfead91504199b8c6c87371e83ca5d |
| <a href="https://testnet.snowscan.xyz/address/0x2e7371a5d032489e4f60216d8d898a4c10805963" target="_blank" rel="noopener noreferrer">Avalanche Fuji</a>           | avalanche-testnet-fuji                | 0x2e7371a5d032489e4f60216d8d898a4c10805963 |
| <a href="https://sepolia.basescan.org/address/0x82300bd7c3958625581cc2f77bc6464dcecdf3e5" target="_blank" rel="noopener noreferrer">Base Sepolia</a>             | ethereum-testnet-sepolia-base-1       | 0x82300bd7c3958625581cc2f77bc6464dcecdf3e5 |
| <a href="https://testnet.bscscan.com/address/0xa238e42cb8782808dbb2f37e19859244ec4779b0" target="_blank" rel="noopener noreferrer">BSC Testnet</a>               | binance\_smart\_chain-testnet         | 0xa238e42cb8782808dbb2f37e19859244ec4779b0 |
| <a href="https://sepolia.etherscan.io/address/0x15fC6ae953E024d975e77382eEeC56A9101f9F88" target="_blank" rel="noopener noreferrer">Ethereum Sepolia</a>         | ethereum-testnet-sepolia              | 0x15fC6ae953E024d975e77382eEeC56A9101f9F88 |
| <a href="https://testnet.purrsec.com/address/0xB27fA1c28288c50542527F64BCda22C9FbAc24CB" target="_blank" rel="noopener noreferrer">Hyperliquid Testnet</a>       | hyperliquid-testnet                   | 0xB27fA1c28288c50542527F64BCda22C9FbAc24CB |
| <a href="https://explorer-sepolia.inkonchain.com/address/0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1" target="_blank" rel="noopener noreferrer">Ink Sepolia</a>   | ink-testnet-sepolia                   | 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1 |
| <a href="https://sepolia-explorer.jovay.io/l2/address/0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1" target="_blank" rel="noopener noreferrer">Jovay Testnet</a>    | jovay-testnet                         | 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1 |
| <a href="https://sepolia.lineascan.build/address/0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1" target="_blank" rel="noopener noreferrer">Linea Sepolia</a>         | ethereum-testnet-sepolia-linea-1      | 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1 |
| <a href="https://sepolia-optimism.etherscan.io/address/0xa2888380dff3704a8ab6d1cd1a8f69c15fea5ee3" target="_blank" rel="noopener noreferrer">OP Sepolia</a>      | ethereum-testnet-sepolia-optimism-1   | 0xa2888380dff3704a8ab6d1cd1a8f69c15fea5ee3 |
| <a href="https://testnet.plasmascan.to/address/0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1" target="_blank" rel="noopener noreferrer">Plasma Testnet</a>          | plasma-testnet                        | 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1 |
| <a href="https://amoy.polygonscan.com/address/0x3675a5eb2286a3f87e8278fc66edf458a2e3bb74" target="_blank" rel="noopener noreferrer">Polygon Amoy</a>             | polygon-testnet-amoy                  | 0x3675a5eb2286a3f87e8278fc66edf458a2e3bb74 |
| <a href="https://sepolia.worldscan.org/address/0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1" target="_blank" rel="noopener noreferrer">World Chain Sepolia</a>     | ethereum-testnet-sepolia-worldchain-1 | 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1 |
| <a href="https://sepolia.explorer.zksync.io/address/0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1" target="_blank" rel="noopener noreferrer">ZKSync Era Sepolia</a> | ethereum-testnet-sepolia-zksync-1     | 0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1 |

## Production Forwarders

These `KeystoneForwarder` addresses are used by deployed workflows. Use these addresses when configuring your consumer contracts for production.

### Mainnets

| Network                                                                                                                                               | Chain Name                    | Forwarder Address                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------ |
| <a href="https://arbiscan.io/address/0xF8344CFd5c43616a4366C34E3EEE75af79a74482" target="_blank" rel="noopener noreferrer">Arbitrum One</a>           | ethereum-mainnet-arbitrum-1   | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |
| <a href="https://snowscan.xyz/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">Avalanche</a>             | avalanche-mainnet             | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://basescan.org/address/0xF8344CFd5c43616a4366C34E3EEE75af79a74482" target="_blank" rel="noopener noreferrer">Base</a>                  | ethereum-mainnet-base-1       | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |
| <a href="https://bscscan.com/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">BNB Smart Chain</a>        | binance\_smart\_chain-mainnet | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://etherscan.io/address/0x0b93082D9b3C7C97fAcd250082899BAcf3af3885" target="_blank" rel="noopener noreferrer">Ethereum Mainnet</a>      | ethereum-mainnet              | 0x0b93082D9b3C7C97fAcd250082899BAcf3af3885 |
| <a href="https://optimistic.etherscan.io/address/0xF8344CFd5c43616a4366C34E3EEE75af79a74482" target="_blank" rel="noopener noreferrer">OP Mainnet</a> | ethereum-mainnet-optimism-1   | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |
| <a href="https://polygonscan.com/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">Polygon</a>            | polygon-mainnet               | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://worldscan.org/address/0x98B8335d29Aca40840Ed8426dA1A0aAa8677d8D1" target="_blank" rel="noopener noreferrer">World Chain</a>          | ethereum-mainnet-worldchain-1 | 0x98B8335d29Aca40840Ed8426dA1A0aAa8677d8D1 |
| <a href="https://explorer.zksync.io/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">ZKSync Era</a>      | ethereum-mainnet-zksync-1     | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |

### Testnets

| Network                                                                                                                                                          | Chain Name                            | Forwarder Address                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------ |
| <a href="https://explorer.curtis.apechain.com/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">Apechain Curtis</a>  | apechain-testnet-curtis               | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://sepolia.arbiscan.io/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">Arbitrum Sepolia</a>          | ethereum-testnet-sepolia-arbitrum-1   | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://testnet.snowscan.xyz/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">Avalanche Fuji</a>           | avalanche-testnet-fuji                | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://sepolia.basescan.org/address/0xF8344CFd5c43616a4366C34E3EEE75af79a74482" target="_blank" rel="noopener noreferrer">Base Sepolia</a>             | ethereum-testnet-sepolia-base-1       | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |
| <a href="https://testnet.bscscan.com/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">BSC Testnet</a>               | binance\_smart\_chain-testnet         | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://sepolia.etherscan.io/address/0xF8344CFd5c43616a4366C34E3EEE75af79a74482" target="_blank" rel="noopener noreferrer">Ethereum Sepolia</a>         | ethereum-testnet-sepolia              | 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 |
| <a href="https://testnet.purrsec.com/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">Hyperliquid Testnet</a>       | hyperliquid-testnet                   | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://explorer-sepolia.inkonchain.com/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">Ink Sepolia</a>   | ink-testnet-sepolia                   | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://sepolia-explorer.jovay.io/l2/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">Jovay Testnet</a>    | jovay-testnet                         | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://sepolia.lineascan.build/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">Linea Sepolia</a>         | ethereum-testnet-sepolia-linea-1      | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://sepolia-optimism.etherscan.io/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">OP Sepolia</a>      | ethereum-testnet-sepolia-optimism-1   | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://testnet.plasmascan.to/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">Plasma Testnet</a>          | plasma-testnet                        | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://amoy.polygonscan.com/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">Polygon Amoy</a>             | polygon-testnet-amoy                  | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://sepolia.worldscan.org/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">World Chain Sepolia</a>     | ethereum-testnet-sepolia-worldchain-1 | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |
| <a href="https://sepolia.explorer.zksync.io/address/0x76c9cf548b4179F8901cda1f8623568b58215E62" target="_blank" rel="noopener noreferrer">ZKSync Era Sepolia</a> | ethereum-testnet-sepolia-zksync-1     | 0x76c9cf548b4179F8901cda1f8623568b58215E62 |

# Writing Data Onchain
Source: https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/writing-data-onchain
Last Updated: 2026-01-20


This guide shows you how to write data from your CRE workflow to a smart contract on the blockchain using the TypeScript SDK. You'll learn the complete two-step process with examples for both single values and structs.

**What you'll learn:**

- How to ABI-encode data using viem
- How to generate signed reports with `runtime.report()`
- How to submit reports with `evmClient.writeReport()`
- How to handle single values, structs, and complex types

## Prerequisites

Before you begin, ensure you have:

1. **A consumer contract** deployed that implements the `IReceiver` interface
   - See [Building Consumer Contracts](/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts) if you need to create one
2. **The contract's address** where you want to send data
3. **Basic familiarity** with the [Getting Started tutorial](/cre/getting-started/part-1-project-setup)

> **NOTE: Follow along with Part 4**
>
> This guide provides detailed explanations for the concepts covered in [Part 4: Writing
> Onchain](/cre/getting-started/part-4-writing-onchain-ts) of the Getting Started tutorial. If you prefer a hands-on
> tutorial, start there!

## Understanding what happens behind the scenes

Before we dive into the code, here's what happens when you call `evmClient.writeReport()`:

1. **Your workflow** generates a signed report containing your ABI-encoded data (via `runtime.report()`)
2. **The EVM Write capability** submits this report to a Chainlink-managed `KeystoneForwarder` contract
3. **The forwarder** validates the report's cryptographic signatures to ensure it came from a trusted DON
4. **The forwarder** calls your consumer contract's `onReport(bytes metadata, bytes report)` function to deliver the data

This is why your consumer contract must implement the `IReceiver` interface—it's not receiving data directly from your workflow, but from the Chainlink Forwarder as an intermediary that provides security and verification.

> **NOTE: Want more details?**
>
> For a deeper explanation of the secure write flow and why CRE uses this architecture, see the [Onchain Write
> Overview](/cre/guides/workflow/using-evm-client/onchain-write/overview-ts).

## The write pattern

Writing data onchain with the TypeScript SDK follows this pattern:

1. **ABI-encode your data** using viem's `encodeAbiParameters()`
2. **Generate a signed report** using `runtime.report()`
3. **Submit the report** using `evmClient.writeReport()`
4. **Check the transaction status** and handle the result

Let's see how this works for different types of data.

## Writing a single value

This example shows how to write a single `uint256` value to your consumer contract.

### Step 1: Set up your imports

```typescript
import { EVMClient, getNetwork, hexToBase64, bytesToHex, TxStatus, type Runtime } from "@chainlink/cre-sdk"
import { encodeAbiParameters, parseAbiParameters } from "viem"
```

### Step 2: ABI-encode your value

Use viem's `encodeAbiParameters()` to encode a single value:

```typescript
// For a single uint256
const reportData = encodeAbiParameters(parseAbiParameters("uint256"), [12345n])

// For a single address
const reportData = encodeAbiParameters(parseAbiParameters("address"), ["0x1234567890123456789012345678901234567890"])

// For a single bool
const reportData = encodeAbiParameters(parseAbiParameters("bool"), [true])
```

> **CAUTION: Always use bigint for Solidity integers**
>
> JavaScript `number` loses precision for values above \~9 quadrillion (<a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER" target="_blank" rel="noopener noreferrer">Number.MAX\_SAFE\_INTEGER</a>). This causes **silent precision loss** — your workflow sends the wrong value without any error.

**Always use `bigint`** (with the `n` suffix) for all Solidity integer types: `12345n`, `1000000000000000000n`, etc.

```typescript
// WRONG - silent precision loss
const amount = 10000000000000001 // 10 quadrillion + 1
// Silently becomes 10000000000000000 (the +1 vanishes)

// CORRECT - use bigint
const amount = 10000000000000001n // Stays exactly 10000000000000001
```

> **CAUTION: Use safe scaling for decimal values**
>
> When scaling values to match a token's decimals (e.g., converting `"1.5"` to `1500000000000000000n`), use <a href="https://viem.sh/docs/utilities/parseUnits" target="_blank">viem's `parseUnits()`</a> instead of `BigInt(value * 1e18)`. Floating-point multiplication causes silent precision loss. See [Safe decimal scaling](/cre/getting-started/before-you-build-ts#safe-decimal-scaling) for details and examples.

### Step 3: Generate the signed report

Convert the encoded data to base64 and generate a report:

```typescript
const reportResponse = runtime
  .report({
    encodedPayload: hexToBase64(reportData),
    encoderName: "evm",
    signingAlgo: "ecdsa",
    hashingAlgo: "keccak256",
  })
  .result()
```

**Report parameters:**

- `encodedPayload`: Your ABI-encoded data converted to base64
- `encoderName`: Always `"evm"` for EVM chains
- `signingAlgo`: Always `"ecdsa"` for EVM chains
- `hashingAlgo`: Always `"keccak256"` for EVM chains

### Step 4: Submit to the blockchain

```typescript
const writeResult = evmClient
  .writeReport(runtime, {
    receiver: config.consumerAddress,
    report: reportResponse,
    gasConfig: {
      gasLimit: config.gasLimit,
    },
  })
  .result()
```

**WriteReport parameters:**

- `receiver`: The address of your consumer contract (must implement `IReceiver`)
- `report`: The signed report from `runtime.report()`
- `gasConfig.gasLimit`: Gas limit for the transaction (as a string, e.g., `"500000"`)

### Step 5: Check the transaction status

```typescript
if (writeResult.txStatus === TxStatus.SUCCESS) {
  const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
  runtime.log(`Transaction successful: ${txHash}`)
  return txHash
}

throw new Error(`Transaction failed with status: ${writeResult.txStatus}`)
```

## Writing a struct

This example shows how to write multiple values as a struct to your consumer contract.

### Your consumer contract

Let's say your consumer contract expects data in this format:

```solidity
struct CalculatorResult {
  uint256 offchainValue;
  int256 onchainValue;
  uint256 finalResult;
}
```

### Step 1: ABI-encode the struct

Use viem to encode all fields as a tuple:

```typescript
const reportData = encodeAbiParameters(
  parseAbiParameters("uint256 offchainValue, int256 onchainValue, uint256 finalResult"),
  [100n, 50n, 150n]
)
```

> **NOTE: Struct encoding**
>
> In viem, structs are encoded as tuples. List all fields with their types and names, then provide the values in the
> same order. The field names help with readability but don't affect encoding.

### Step 2: Generate and submit

The rest of the process is identical to writing a single value:

```typescript
// Generate signed report
const reportResponse = runtime
  .report({
    encodedPayload: hexToBase64(reportData),
    encoderName: "evm",
    signingAlgo: "ecdsa",
    hashingAlgo: "keccak256",
  })
  .result()

// Submit to blockchain
const writeResult = evmClient
  .writeReport(runtime, {
    receiver: config.consumerAddress,
    report: reportResponse,
    gasConfig: {
      gasLimit: config.gasLimit,
    },
  })
  .result()

// Check status
if (writeResult.txStatus === TxStatus.SUCCESS) {
  runtime.log(`Successfully wrote struct to contract`)
}
```

## Organizing ABIs for reusable data structures

For workflows that interact with consumer contracts multiple times or use complex data structures, organizing your ABI definitions in dedicated files improves code maintainability and type safety.

### Why organize ABIs?

- **Reusability**: Define data structures once, use them across multiple workflows
- **Type safety**: TypeScript can infer types from your ABI definitions
- **Maintainability**: Update contract interfaces in one place
- **Consistency**: Match the pattern used for [reading from contracts](/cre/guides/workflow/using-evm-client/onchain-read-ts)

### File structure

Create a `contracts/abi/` directory in your project root to store ABI definitions:

```
my-cre-project/
├── contracts/
│   └── abi/
│       ├── ConsumerContract.ts    # Consumer contract data structures
│       └── index.ts                # Export all ABIs
├── my-workflow/
│   └── main.ts
└── project.yaml
```

### Creating an ABI file

Let's say your consumer contract expects a `CalculatorResult` struct. Create `contracts/abi/ConsumerContract.ts`:

```typescript
import { parseAbiParameters } from "viem"

// Define the ABI parameters for your struct
export const CalculatorResultParams = parseAbiParameters(
  "uint256 offchainValue, int256 onchainValue, uint256 finalResult"
)

// Define the TypeScript type for type safety
export type CalculatorResult = {
  offchainValue: bigint
  onchainValue: bigint
  finalResult: bigint
}
```

### Creating an index file

For cleaner imports, create `contracts/abi/index.ts`:

```typescript
export { CalculatorResultParams, type CalculatorResult } from "./ConsumerContract"
```

### Using the organized ABI

Now you can import and use these definitions in your workflow:

```typescript
import { EVMClient, getNetwork, hexToBase64, bytesToHex, TxStatus, type Runtime } from "@chainlink/cre-sdk"
import { encodeAbiParameters } from "viem"
import { CalculatorResultParams, type CalculatorResult } from "../contracts/abi"

const writeDataOnchain = (runtime: Runtime<Config>): string => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
  })

  if (!network) {
    throw new Error(`Network not found`)
  }

  const evmClient = new EVMClient(network.chainSelector.selector)

  // Create type-safe data object
  const data: CalculatorResult = {
    offchainValue: 100n,
    onchainValue: 50n,
    finalResult: 150n,
  }

  // Encode using imported ABI parameters
  const reportData = encodeAbiParameters(CalculatorResultParams, [
    data.offchainValue,
    data.onchainValue,
    data.finalResult,
  ])

  // Generate and submit report (same as before)
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result()

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.consumerAddress,
      report: reportResponse,
      gasConfig: { gasLimit: runtime.config.gasLimit },
    })
    .result()

  if (writeResult.txStatus === TxStatus.SUCCESS) {
    const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
    return txHash
  }

  throw new Error(`Transaction failed`)
}
```

### When to use this pattern

Use organized ABI files when:

- You have **multiple workflows** writing to the same consumer contract
- Your data structures are **complex** (nested structs, arrays, multiple parameters)
- You want **type checking** when constructing data objects
- Your project has **multiple consumer contracts** with different interfaces

For simple, one-off workflows with single values, inline `parseAbiParameters()` is sufficient.

## Complete code example

Here's a full workflow that writes a struct to a consumer contract:

### Configuration (`config.json`)

```json
{
  "schedule": "0 */5 * * * *",
  "chainSelectorName": "ethereum-testnet-sepolia",
  "consumerAddress": "0xYourConsumerContractAddress",
  "gasLimit": "500000"
}
```

### Workflow code (`main.ts`)

```typescript
import {
  CronCapability,
  EVMClient,
  getNetwork,
  hexToBase64,
  bytesToHex,
  TxStatus,
  type Runtime,
  Runner,
} from "@chainlink/cre-sdk"
import { encodeAbiParameters, parseAbiParameters } from "viem"
import { z } from "zod"

// Config schema
const configSchema = z.object({
  schedule: z.string(),
  chainSelectorName: z.string(),
  consumerAddress: z.string(),
  gasLimit: z.string(),
})

type Config = z.infer<typeof configSchema>

const writeDataOnchain = (runtime: Runtime<Config>): string => {
  // Get network info
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
  })

  if (!network) {
    throw new Error(`Network not found: ${runtime.config.chainSelectorName}`)
  }

  // Create EVM client
  const evmClient = new EVMClient(network.chainSelector.selector)

  // 1. Encode your data (struct with 3 fields)
  const reportData = encodeAbiParameters(
    parseAbiParameters("uint256 offchainValue, int256 onchainValue, uint256 finalResult"),
    [100n, 50n, 150n]
  )

  runtime.log(`Encoded data for consumer contract`)

  // 2. Generate signed report
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result()

  runtime.log(`Generated signed report`)

  // 3. Submit to blockchain
  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.consumerAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result()

  // 4. Check status and return
  if (writeResult.txStatus === TxStatus.SUCCESS) {
    const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
    runtime.log(`Transaction successful: ${txHash}`)
    return txHash
  }

  throw new Error(`Transaction failed with status: ${writeResult.txStatus}`)
}

const initWorkflow = (config: Config) => {
  const cron = new CronCapability()
  return [
    cron.handler(
      cron.trigger({
        schedule: config.schedule,
      }),
      writeDataOnchain
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
```

## Working with complex types

### Arrays

```typescript
// Array of uint256
const reportData = encodeAbiParameters(parseAbiParameters("uint256[]"), [[100n, 200n, 300n]])

// Array of addresses
const reportData = encodeAbiParameters(parseAbiParameters("address[]"), [["0xAddress1", "0xAddress2", "0xAddress3"]])
```

### Nested structs

```typescript
// Struct with nested struct: ReserveData { uint256 total, Asset { address token, uint256 balance } }
const reportData = encodeAbiParameters(parseAbiParameters("uint256 total, (address token, uint256 balance) asset"), [
  1000n,
  ["0xTokenAddress", 500n],
])
```

### Multiple parameters with mixed types

```typescript
// address recipient, uint256 amount, bool isActive
const reportData = encodeAbiParameters(parseAbiParameters("address recipient, uint256 amount, bool isActive"), [
  "0xRecipientAddress",
  42000n,
  true,
])
```

## Type conversions

### JavaScript/TypeScript to Solidity

| Solidity Type            | TypeScript Type            | Example                                |
| ------------------------ | -------------------------- | -------------------------------------- |
| `uint256`, `uint8`, etc. | `bigint`                   | `12345n`                               |
| `int256`, `int8`, etc.   | `bigint`                   | `-12345n`                              |
| `address`                | `string` (hex)             | `"0x1234..."`                          |
| `bool`                   | `boolean`                  | `true`                                 |
| `bytes`, `bytes32`       | `Uint8Array` or hex string | `new Uint8Array(...)` or `"0xabcd..."` |
| `string`                 | `string`                   | `"Hello"`                              |
| Arrays                   | `Array`                    | `[100n, 200n]`                         |
| Struct                   | Tuple                      | `[100n, "0x...", true]`                |

### Helper functions

The SDK provides utilities for data conversion:

```typescript
import { hexToBase64, bytesToHex } from "@chainlink/cre-sdk"

// Convert hex string to base64 (for report generation)
const base64 = hexToBase64(hexString)

// Convert Uint8Array to hex string (for logging, display)
const hex = bytesToHex(uint8Array)
```

## Handling errors

Always check the transaction status and handle potential failures:

```typescript
const writeResult = evmClient
  .writeReport(runtime, {
    receiver: config.consumerAddress,
    report: reportResponse,
    gasConfig: {
      gasLimit: config.gasLimit,
    },
  })
  .result()

// Check for success
if (writeResult.txStatus === TxStatus.SUCCESS) {
  runtime.log(`Success! TxHash: ${bytesToHex(writeResult.txHash || new Uint8Array(32))}`)
} else if (writeResult.txStatus === TxStatus.REVERTED) {
  runtime.log(`Transaction reverted: ${writeResult.errorMessage || "Unknown error"}`)
  throw new Error(`Write failed: ${writeResult.errorMessage}`)
} else if (writeResult.txStatus === TxStatus.FATAL) {
  runtime.log(`Fatal error: ${writeResult.errorMessage || "Unknown error"}`)
  throw new Error(`Fatal write error: ${writeResult.errorMessage}`)
}
```

> **CAUTION: Gas limit configuration**
>
> Make sure your `gasLimit` is sufficient for your transaction. If it's too low, the transaction will run out of gas and
> revert.

## Next steps

- **[Building Consumer Contracts](/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts)** - Learn how to create contracts that receive workflow data
- **[EVM Client Reference](/cre/reference/sdk/evm-client-ts)** - Complete API documentation for `EVMClient`
- **[Part 4: Writing Onchain](/cre/getting-started/part-4-writing-onchain-ts)** - Hands-on tutorial


# Using Time in Workflows
Source: https://docs.chain.link/cre/guides/workflow/time-in-workflows-ts
Last Updated: 2026-02-03


> **NOTE: TL;DR**
>
> CRE provides **DON Time**: a consensus-derived timestamp so different nodes see the *same time*. Use the SDK's runtime
> call, `runtime.now()`, whenever your workflow logic depends on time. Do **not** use `Date.now()` or other local time
> sources in DON Mode — they introduce non-determinism.

## The problem: Why time needs consensus

Workflows often rely on time for decisions (market-hours checks), scheduling (retries/backoffs), and observability (log timestamps). In a decentralized network, nodes do not share an identical clock—clock drift, resource contention, and OS scheduling can skew each node's local time. If each node consults its own clock:

- Different nodes may take **different branches** of your logic (e.g., one thinks the market is open, another does not).
- Logs across nodes become **hard to correlate**.
- Data fetched using time (e.g., "fetch price at timestamp N") can be **inconsistent**.

**DON Time** removes these divergences by making time **deterministic in the DON**.

## The solution: DON time

**DON Time** is a timestamp computed by an <a href="https://docs.chain.link/architecture-overview/off-chain-reporting" target="_blank" rel="noopener noreferrer">OCR (Off-Chain Reporting)</a> plugin and agreed upon by the nodes participating in CRE. You access it through the SDK's runtime call, `runtime.now()`, not via JavaScript's `Date.now()`. The `runtime.now()` method returns a standard JavaScript `Date` object.

**Key properties:**

- **Deterministic across nodes**: nodes see the same timestamp.
- **Sequenced per workflow**: time responses are associated with a **time-call sequence number** inside each workflow execution (1st call, 2nd call, …). Node execution timing might be slightly off, but a given call will resolve to the **same DON timestamp**.
- **Low latency**: the plugin runs continuously with **delta round = 0**, and each node **transmits** results back to outstanding requests at the end of every round.
- **Tamper-resistant**: workflows don't expose host machine time, reducing timing-attack surface.

> **NOTE: A Note on Accuracy**
>
> DON Time is computed as the **median of nodes' local observations** in each round. It is designed for **consistency**
> across the DON rather than exact alignment to an external UTC source. Think of it as a highly reliable clock for your
> workflows. Do not treat it as a high-precision clock.

## How it works: A high-level view

1. Your workflow calls **`runtime.now()`**.
2. **The Chainlink network takes this request**: The Workflow Engine's **TimeProvider** assigns that call a **sequence number** and enqueues it in the **DON Time Store**.
3. **All the nodes agree on a single time (the DON Time)**: The **OCR Time Plugin** on each node reaches consensus on a new DON timestamp (the median of observed times).
4. Each node **returns** the newest DON timestamp to every pending request and updates its **last observed DON time** cache.
5. The result is written back into the WebAssembly execution, and your workflow continues.

Because requests are sequenced, *Call 1* for a workflow instance will always return the same DON timestamp on every node. If Node A hits *Call 2* before Node B, A will block until the DON timestamp for *Call 2* is produced; when B reaches *Call 2*, it immediately reuses that value.

## Execution modes: DON mode vs. Node mode

### DON mode (default for workflows)

- Time is **consensus-based** and **deterministic**.
- Use for **any** logic where different outcomes across nodes would be a bug. Examples:
  - Market-hours gates
  - Time-windowed queries ("last 15 minutes")
  - Retry/backoff logic that must align across nodes
  - Timestamps used for cross-node correlation (logging, audit trails)

### Node mode (advanced / special cases)

- Workflow authors handle consensus themselves.
- `runtime.now()` in Node Mode is a non-blocking call that returns the **last generated DON timestamp** from the local node's cache.
- Useful in situations where you already expect non-determinism (e.g., inherently variable HTTP responses).

> **CAUTION: Use DON Mode**
>
> Unless you have a specific reason and understand the trade-offs, **always use DON Mode** for time-dependent logic.

## Best practices: Avoiding non-determinism in DON mode

When running in DON Mode, you get determinism **if and only if** you base time-dependent logic on DON Time.

**Avoid** these patterns:

- **Reading local time** (`Date.now()`, `new Date()`, etc.). Always use `runtime.now()` from the CRE SDK.
- **Mixing time sources** in the same control path.
- **Per-node "sleeps" based on local time** that gate deterministic decisions.

**Deterministic patterns:**

- ✅ Gate behavior with:
  ```typescript
  const now = runtime.now()
  if (isMarketOpen(now)) {
    // proceed
  }
  ```
- ✅ Compute windows from DON Time:
  ```typescript
  const now = runtime.now()
  const fifteenMinutesMs = 15 * 60 * 1000
  const windowStart = new Date(now.getTime() - fifteenMinutesMs)
  fetchData(windowStart, now)
  ```

## FAQ

**Is DON Time "real UTC time"?**

It's the **median of node observations** per round. It closely tracks real time but prioritizes **consistency** over absolute accuracy.

**What is the resolution?**

New DON timestamps are produced continuously (multiple per second). Treat it as coarse-grained real time suitable for gating and logging, not sub-millisecond measurement.

**Why can't I use `Date.now()`?**

`Date.now()` reads the local system clock, which differs slightly on each node. This breaks consensus—nodes may execute different code paths and fail to agree on the workflow result.


