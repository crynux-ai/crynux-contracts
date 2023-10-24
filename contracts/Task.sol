// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./Node.sol";

contract Task is Ownable {
    struct TaskInfo {
        uint256 id;
        address creator;
        bytes32 taskHash;
        bytes32 dataHash;
        bool isSuccess;
        address[] selectedNodes;
        bytes32[] commitments;
        bytes32[] nonces;
        bytes[] results;
        uint[] resultDisclosedRounds;
        address resultNode;
    }

    Node private node;
    IERC20 private cnxToken;
    mapping(uint => TaskInfo) private tasks;
    mapping(address => uint256) private nodeTasks;
    uint256 private nextTaskId;
    uint256 private totalTasks;
    uint256 private taskFeePerNode;
    uint private distanceThreshold;

    event TaskCreated(
        uint256 taskId,
        address indexed creator,
        address indexed selectedNode,
        bytes32 taskHash,
        bytes32 dataHash,
        uint round
    );
    event TaskResultCommitmentsReady(uint256 taskId);
    event TaskSuccess(uint256 taskId, bytes result, address indexed resultNode);
    event TaskAborted(uint256 taskId);

    constructor(Node nodeInstance, IERC20 tokenInstance) {
        node = nodeInstance;
        cnxToken = tokenInstance;
        taskFeePerNode = 10 * 10 ** 18;
        nextTaskId = 1;
        distanceThreshold = 5;
    }

    function createTask(bytes32 taskHash, bytes32 dataHash) public {
        uint256 taskFee = taskFeePerNode * 3;

        require(
            cnxToken.balanceOf(msg.sender) >= taskFee,
            "Not enough tokens for task"
        );
        require(
            cnxToken.allowance(msg.sender, address(this)) >= taskFee,
            "Not enough allowance for task"
        );
        require(node.availableNodes() >= 3, "Not enough nodes");

        require(
            cnxToken.transferFrom(msg.sender, address(this), taskFee),
            "Task fee payment failed"
        );

        TaskInfo memory taskInfo;

        taskInfo.id = nextTaskId++;
        taskInfo.creator = msg.sender;
        taskInfo.taskHash = taskHash;
        taskInfo.dataHash = dataHash;
        taskInfo.isSuccess = false;
        taskInfo.commitments = new bytes32[](3);
        taskInfo.nonces = new bytes32[](3);
        taskInfo.results = new bytes[](3);

        tasks[taskInfo.id] = taskInfo;

        for (uint i = 0; i < 3; i++) {
            address nodeAddress = getSelectedNode(taskHash, dataHash, i);
            tasks[taskInfo.id].selectedNodes.push(nodeAddress);
            node.startTask(nodeAddress);
            nodeTasks[nodeAddress] = taskInfo.id;
            emit TaskCreated(
                taskInfo.id,
                msg.sender,
                nodeAddress,
                taskHash,
                dataHash,
                i
            );
        }
    }

    function getSelectedNode(
        bytes32 taskHash,
        bytes32 dataHash,
        uint round
    ) public view returns (address) {
        bytes32 blockRand = keccak256(
            abi.encodePacked(blockhash(block.number - 1), round)
        );
        uint256 randNum = uint256(blockRand ^ taskHash ^ dataHash) %
            node.totalNodes();
        return node.getAvailableNodeStartsFrom(randNum);
    }

    function submitTaskResultCommitment(
        uint256 taskId,
        uint round,
        bytes32 commitment,
        bytes32 nonce
    ) public {
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(
            tasks[taskId].selectedNodes[round] == msg.sender,
            "Not selected node"
        );
        require(tasks[taskId].commitments[round] == 0, "Already submitted");

        require(
            nonce != tasks[taskId].nonces[0] &&
                nonce != tasks[taskId].nonces[1] &&
                nonce != tasks[taskId].nonces[2],
            "Nonce already used"
        );

        tasks[taskId].commitments[round] = commitment;
        tasks[taskId].nonces[round] = nonce;

        if (
            tasks[taskId].commitments[0] != 0 &&
            tasks[taskId].commitments[1] != 0 &&
            tasks[taskId].commitments[2] != 0
        ) {
            emit TaskResultCommitmentsReady(taskId);
        }
    }

    function discloseTaskResult(
        uint256 taskId,
        uint round,
        bytes calldata result
    ) public {
        require(result.length > 0, "Invalid result");
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(
            tasks[taskId].selectedNodes[round] == msg.sender,
            "Not selected node"
        );
        require(tasks[taskId].results[round].length == 0, "Already submitted");
        require(
            tasks[taskId].commitments[0] != 0 &&
                tasks[taskId].commitments[1] != 0 &&
                tasks[taskId].commitments[2] != 0,
            "Commitments not ready"
        );

        require(
            tasks[taskId].commitments[round] ==
                keccak256(
                    abi.encodePacked(result, tasks[taskId].nonces[round])
                ),
            "Mismatch result and commitment"
        );

        tasks[taskId].results[round] = result;
        tasks[taskId].resultDisclosedRounds.push(round);

        checkTaskResult(taskId);
    }

    function tryDeleteTask(uint256 taskId) internal {
        // Delete task when all nodes were settled or slashed.
        require(tasks[taskId].id != 0, "Task not exist");

        for (uint i = 0; i < 3; i++) {
            if (nodeTasks[tasks[taskId].selectedNodes[i]] != 0) {
                return;
            }
        }
        delete tasks[taskId];
    }

    function reportResultsUploaded(uint256 taskId, uint round) public {
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(
            tasks[taskId].selectedNodes[round] == msg.sender,
            "Not selected node"
        );
        require(tasks[taskId].resultNode == msg.sender, "Not result round");

        settleNodeByRound(taskId, round);
        tryDeleteTask(taskId);
    }

    function reportTaskError(uint256 taskId, uint round) public {
        require(tasks[taskId].id != 0, "Task not exist");
        require(round >= 0 && round < 3, "Round not exist");
        require(
            tasks[taskId].selectedNodes[round] == msg.sender,
            "Not selected node"
        );
        require(tasks[taskId].commitments[round] == 0, "Already submitted");

        uint256 errCommitment = 1;
        tasks[taskId].commitments[round] = bytes32(errCommitment); // Set to a non-zero value to enter result committed state
        tasks[taskId].resultDisclosedRounds.push(round); // Set to result disclosed state, the result is a special zero value

        if (
            tasks[taskId].commitments[0] != 0 &&
            tasks[taskId].commitments[1] != 0 &&
            tasks[taskId].commitments[2] != 0
        ) {
            emit TaskResultCommitmentsReady(taskId);
        }

        checkTaskResult(taskId);
    }

    function checkTaskResult(uint256 taskId) internal {
        if (tasks[taskId].resultDisclosedRounds.length == 2) {
            // If no node is cheating, we can already give the result back to the user.
            // And free the two honest nodes.
            tasks[taskId].isSuccess = compareRound(taskId, 0, 1);
            if (tasks[taskId].isSuccess) {
                settleNodeByDiscloseIndex(taskId, 1);
                emitTaskFinishedEvent(taskId, 0);
            }
        } else if (tasks[taskId].resultDisclosedRounds.length == 3) {
            if (tasks[taskId].isSuccess) {
                // Task already succeeded. Check the result and finish the task
                if (compareRound(taskId, 0, 2)) {
                    // no one is cheating
                    settleNodeByDiscloseIndex(taskId, 2);
                } else {
                    // 2 is cheating
                    punishNodeByDiscloseIndex(taskId, 2);
                }
            } else {
                if (compareRound(taskId, 0, 2)) {
                    // 1 is cheating
                    settleNodeByDiscloseIndex(taskId, 2);
                    punishNodeByDiscloseIndex(taskId, 1);
                    emitTaskFinishedEvent(taskId, 0);
                } else if (compareRound(taskId, 1, 2)) {
                    // 0 is cheating
                    settleNodeByDiscloseIndex(taskId, 2);
                    punishNodeByDiscloseIndex(taskId, 0);
                    emitTaskFinishedEvent(taskId, 1);
                } else {
                    // 3 different results...
                    // Let's just abort the task for now...
                    abortTask(taskId);
                }
            }

            tryDeleteTask(taskId);
        }
    }

    function emitTaskFinishedEvent(
        uint256 taskId,
        uint honestRoundIndex
    ) internal {
        uint honestRound = tasks[taskId].resultDisclosedRounds[
            honestRoundIndex
        ];
        if (tasks[taskId].results[honestRound].length > 0) {
            // Success task
            tasks[taskId].resultNode = tasks[taskId].selectedNodes[honestRound];
            emit TaskSuccess(
                taskId,
                tasks[taskId].results[honestRound],
                tasks[taskId].selectedNodes[honestRound]
            );
        } else {
            // Aborted task
            settleNodeByDiscloseIndex(taskId, honestRoundIndex);
            emit TaskAborted(taskId);
        }
    }

    function abortTask(uint256 taskId) internal {
        // Return the task fee to the user
        require(
            cnxToken.transfer(tasks[taskId].creator, taskFeePerNode * 3),
            "Token transfer failed"
        );

        // Free the nodes
        for (uint i = 0; i < 3; i++) {
            uint round = tasks[taskId].resultDisclosedRounds[i];
            address nodeAddress = tasks[taskId].selectedNodes[round];
            nodeTasks[nodeAddress] = 0;
            node.finishTask(nodeAddress);
        }
        emit TaskAborted(taskId);
    }

    function compareRound(
        uint256 taskId,
        uint roundIndexA,
        uint roundIndexB
    ) internal view returns (bool) {
        uint roundA = tasks[taskId].resultDisclosedRounds[roundIndexA];
        uint roundB = tasks[taskId].resultDisclosedRounds[roundIndexB];

        bytes memory resultA = tasks[taskId].results[roundA];
        bytes memory resultB = tasks[taskId].results[roundB];

        return compareResult(resultA, resultB, distanceThreshold);
    }

    function settleNodeByRound(uint256 taskId, uint round) internal {
        address nodeAddress = tasks[taskId].selectedNodes[round];
        // Transfer task fee to the node
        require(
            cnxToken.transfer(nodeAddress, taskFeePerNode),
            "Token transfer failed"
        );

        // Free the node
        nodeTasks[nodeAddress] = 0;
        node.finishTask(nodeAddress);
    }

    function settleNodeByDiscloseIndex(
        uint256 taskId,
        uint discloseIndex
    ) internal {
        settleNodeByRound(
            taskId,
            tasks[taskId].resultDisclosedRounds[discloseIndex]
        );
    }

    function punishNodeByDiscloseIndex(
        uint256 taskId,
        uint discloseIndex
    ) internal {
        // Return the task fee to user
        require(
            cnxToken.transfer(tasks[taskId].creator, taskFeePerNode),
            "Token transfer failed"
        );

        address nodeAddress = tasks[taskId].selectedNodes[
            tasks[taskId].resultDisclosedRounds[discloseIndex]
        ];
        nodeTasks[nodeAddress] = 0;

        node.slash(nodeAddress);
    }

    function hamming(bytes8 a, bytes8 b) internal pure returns (uint) {
        uint64 c = uint64(a ^ b);
        uint64 res = 0;
        while (c > 0) {
            res += c & 1;
            c = c >> 1;
        }
        return uint(res);
    }

    function compareResult(
        bytes memory a,
        bytes memory b,
        uint threshold
    ) internal pure returns (bool) {
        if (a.length == b.length && a.length % 8 == 0) {
            for (uint start = 0; start < a.length; start += 8) {
                uint distance = hamming(
                    bytes8(slice(a, start, 8)),
                    bytes8(slice(b, start, 8))
                );
                if (distance >= threshold) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    function slice(
        bytes memory _bytes,
        uint256 _start,
        uint256 _length
    ) internal pure returns (bytes memory) {
        require(_length + 31 >= _length, "slice_overflow");
        require(_bytes.length >= _start + _length, "slice_outOfBounds");

        bytes memory tempBytes;

        // Check length is 0. `iszero` return 1 for `true` and 0 for `false`.
        assembly {
            switch iszero(_length)
            case 0 {
                // Get a location of some free memory and store it in tempBytes as
                // Solidity does for memory variables.
                tempBytes := mload(0x40)

                // Calculate length mod 32 to handle slices that are not a multiple of 32 in size.
                let lengthmod := and(_length, 31)

                // tempBytes will have the following format in memory: <length><data>
                // When copying data we will offset the start forward to avoid allocating additional memory
                // Therefore part of the length area will be written, but this will be overwritten later anyways.
                // In case no offset is require, the start is set to the data region (0x20 from the tempBytes)
                // mc will be used to keep track where to copy the data to.
                let mc := add(
                    add(tempBytes, lengthmod),
                    mul(0x20, iszero(lengthmod))
                )
                let end := add(mc, _length)

                for {
                    // Same logic as for mc is applied and additionally the start offset specified for the method is added
                    let cc := add(
                        add(
                            add(_bytes, lengthmod),
                            mul(0x20, iszero(lengthmod))
                        ),
                        _start
                    )
                } lt(mc, end) {
                    // increase `mc` and `cc` to read the next word from memory
                    mc := add(mc, 0x20)
                    cc := add(cc, 0x20)
                } {
                    // Copy the data from source (cc location) to the slice data (mc location)
                    mstore(mc, mload(cc))
                }

                // Store the length of the slice. This will overwrite any partial data that
                // was copied when having slices that are not a multiple of 32.
                mstore(tempBytes, _length)

                // update free-memory pointer
                // allocating the array padded to 32 bytes like the compiler does now
                // To set the used memory as a multiple of 32, add 31 to the actual memory usage (mc)
                // and remove the modulo 32 (the `and` with `not(31)`)
                mstore(0x40, and(add(mc, 31), not(31)))
            }
            // if we want a zero-length slice let's just return a zero-length array
            default {
                tempBytes := mload(0x40)
                // zero out the 32 bytes slice we are about to return
                // we need to do it because Solidity does not garbage collect
                mstore(tempBytes, 0)

                // update free-memory pointer
                // tempBytes uses 32 bytes in memory (even when empty) for the length.
                mstore(0x40, add(tempBytes, 0x20))
            }
        }

        return tempBytes;
    }

    function updateTaskFeePerNode(uint256 fee) public onlyOwner {
        taskFeePerNode = fee;
    }

    function updateDistanceThreshold(uint threshold) public onlyOwner {
        distanceThreshold = threshold;
    }

    function getTask(uint256 taskId) public view returns (TaskInfo memory) {
        return tasks[taskId];
    }

    function getNodeTask(address nodeAddress) public view returns (uint256) {
        return nodeTasks[nodeAddress];
    }
}
