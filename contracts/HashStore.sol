// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @author Blockchain Competence Center Mittweida
/// @notice This contract is used to store file hashes and their timestamps
contract HashStore {

  /* State */
  mapping(string => Entry) public entries; // UUID => Entry

  struct Entry {
    uint256 timestamp;
    bytes32 hash;
  }

  /* Events */
  event HashStored(string indexed uuid, bytes32 indexed hash, uint256 timestamp);

  /* External functions */
  function storeHash(string memory _uuid, bytes32 _hash) external {
    require(entries[_uuid].timestamp == 0, "UUID already exists");
    
    entries[_uuid].timestamp = block.timestamp;
    entries[_uuid].hash = _hash;

    emit HashStored(_uuid, _hash, block.timestamp);
  }
}
