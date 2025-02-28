// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract HashStore {
    mapping(bytes32 => uint256) public timestamps;

    event HashStored(bytes32 indexed hash, uint256 timestamp);

    function storeHash(bytes32 hash) external {
        require(timestamps[hash] == 0, "Hash already stored");
        
        timestamps[hash] = block.timestamp;
        
        emit HashStored(hash, block.timestamp);
    }

    function verifyHash(bytes32 hash) external view returns (uint256) {
        return timestamps[hash];
    }
}
