// SPDX-License-Identifier: BSD-3-Clause
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Pausable.sol";

/// @author Blockchain Competence Center Mittweida
/// @notice This contract is used to reach consensus over arbitrary web content
contract ResourceConsensus is Pausable {
    
    // State
    // Storage Slot 1
    address public immutable owner; // 20 Byte
    enum Status { REQUESTED, VALID, INVALID } // 1 Byte
    uint8 public totalValidators; // 1 Byte, Range 0-255
    uint32 public requestCount; // 4 Bytes, Range 0-4,294,967,295

    // Dynamic types
    mapping(address => bool) public isValidator; // set and check
    mapping(address => bool) public isRequester; // set and check
    mapping(uint256 => Snapshot) public snapshots; // request number => Snapshot
    mapping(string => uint32[]) public history; // URL => request number history

    // Structure to store snapshot details
    struct Snapshot {
        // Struct Storage Slot 1 (fully packed with 32 bytes)
        uint32 requestNumber; // 4 Bytes
        address requester; // 20 Byte
        uint40 TS_of_Request; // 5 Byte, good for ~34k years, timestamp component 1 (request)
        uint8 potentialVotes; // 1 Byte, based on "totalValidators"
        uint8 requiredMinVotes; // 1 Byte, 2/3 rounded upwards
        uint8 totalVotes; // 1 Byte
        // Struct Storage Slot 2
        bytes16 consensus_CS; // 128-bit checksum that reached consensus (= 0x00000000000000000000000000000000 when failed)
        Status status; // 1 Byte
        uint40 TS_of_Finalized; // 5 Byte, good for ~34k years, timestamp component 2 (finalized)
        // Dynamic types (32 Bytes each for slot reference, that points to extra slots for the actual data) 
        string url; // URL of web content
        mapping(address => bytes32) votedFor; // voter => checksum
        mapping(bytes32 => uint256) voteCount; // checksum => vote count
        bytes16[] uniqueChecksums; // (i.e. SHA-256 hashes of website screenshots)
    }

    // Events
    event SnapshotRequested(uint32 indexed _requestNumber, address _requester, string _url, Status _status, uint40 indexed _TS_of_Request);
    event ChecksumSubmitted(uint32 indexed _requestNumber, address _validator, bytes16 _checksum);
    event SnapshotFinalized(uint32 indexed _requestNumber, bytes16 _consensus_CS, Status indexed _finalStatus, uint40 indexed _TS_of_Finalized);
    event ValidatorUpdated(address indexed _account, bool indexed _isValidator);
    event RequesterUpdated(address indexed _account, bool indexed _isRequester);

    // Modifiers to restrict function access
    modifier onlyOwner() {
        require(msg.sender == owner, "Error. You're not the contract owner!");
        _;
    }
    modifier onlyValidator() {
        require(msg.sender == tx.origin, "Error. No delegate calls allowed!");
        require(isValidator[msg.sender], "Error. You're not a validator!");
        _;
    }
    modifier onlyRequester() {
        require(msg.sender == tx.origin, "Error. No delegate calls allowed!");
        require(isRequester[msg.sender], "Error. You're not a requester!");
        _;
    }

    // Constructor with initial validator and requester accounts
    constructor(address[] memory initialValidators, address[] memory initialRequesters) {
        owner = msg.sender;

        for (uint256 i = 0; i < initialValidators.length; i++) {
            isValidator[initialValidators[i]] = true;
            totalValidators++;
            emit ValidatorUpdated(initialValidators[i], true);
        }

        for (uint256 i = 0; i < initialRequesters.length; i++) {
            isRequester[initialRequesters[i]] = true;
            emit RequesterUpdated(initialRequesters[i], true);
        }
    }

    // Function to request a snapshot with a given URL
    function requestSnapshot(string calldata _url) external onlyRequester whenNotPaused {
        
        require(bytes(_url).length != 0, "Error. URL cannot be empty!");
        Snapshot storage ss = snapshots[requestCount + 1];
        
        ss.url = _url;

        ss.requestNumber = ++requestCount;
        ss.requester = msg.sender;
        ss.status = Status.REQUESTED;
        ss.TS_of_Request = uint40(block.timestamp);

        ss.potentialVotes = totalValidators;
        ss.requiredMinVotes = (ss.potentialVotes * 2 + 1) / 3; // +1 (from +3/2) rounds up when needed

        emit SnapshotRequested(ss.requestNumber, ss.requester, _url, ss.status, ss.TS_of_Request);
    }

    // Function for validators to submit their checksum, that also checks if consensus has been reached or failed
    function submitChecksum(uint32 _requestNumber, bytes16 _checksum) external onlyValidator {
        
        require(_checksum != 0, "Error. Checksum cannot be 0!");
        Snapshot storage ss = snapshots[_requestNumber];
        require(ss.TS_of_Request != 0, "Error. Snapshot has not been requested!");
        require(ss.status != Status.INVALID, "Error. Consensus already failed!");
        require(ss.votedFor[msg.sender] == 0, "Error. Validator has already voted!");
        require(ss.totalVotes < ss.potentialVotes, "Error. Total vote limit reached!");
        if (block.timestamp - ss.TS_of_Request >= 3 minutes) {
            // If not enough voters voted in time window, finalize the snapshot as INVALID
            if (ss.totalVotes < ss.requiredMinVotes) { 
                ss.status = Status.INVALID;
                ss.TS_of_Finalized = uint40(block.timestamp);
                emit SnapshotFinalized(ss.requestNumber, ss.consensus_CS, ss.status, ss.TS_of_Finalized);
                return;
            }
        }
        require(block.timestamp - ss.TS_of_Request < 3 minutes, "Error. 3 minute time challenge expired!");

        ss.votedFor[msg.sender] = _checksum;
        if (ss.voteCount[_checksum] == 0) {
            ss.uniqueChecksums.push(_checksum);
        }
        ss.voteCount[_checksum]++;
        ss.totalVotes++;

        // add vote when status is already valid (can’t and wont change the consensus)
        if (ss.status == Status.VALID) {
            emit ChecksumSubmitted(_requestNumber, msg.sender, _checksum);
            return;
        } 
        emit ChecksumSubmitted(_requestNumber, msg.sender, _checksum);

        // Check if number of actual votes is enough for consensus minimum requirements
        if (ss.totalVotes >= ss.requiredMinVotes) {
            
            // Iterate over unique checksums to check if any checksum has enough votes
            for (uint256 i = 0; i < ss.uniqueChecksums.length; i++) {
                if (ss.voteCount[ss.uniqueChecksums[i]] >= ss.requiredMinVotes) {
                    ss.consensus_CS = ss.uniqueChecksums[i];
                    break;
                }
            }
            // Consensus reached, (executed only once)
            if (ss.consensus_CS != 0) {
                history[ss.url].push(_requestNumber);
                ss.status = Status.VALID;
                ss.TS_of_Finalized = uint40(block.timestamp);
                emit SnapshotFinalized(_requestNumber, ss.consensus_CS, ss.status, ss.TS_of_Finalized);
            }
            // Consensus failed, (executed only once)
            else if (ss.totalVotes == ss.potentialVotes) {
                ss.status = Status.INVALID;
                ss.TS_of_Finalized = uint40(block.timestamp);
                emit SnapshotFinalized(_requestNumber, ss.consensus_CS, ss.status, ss.TS_of_Finalized);
            }
        }
    }

    /* Owner management functions */

    // pause the contract
    function pauseContract() public onlyOwner {
        _pause();
    }

    // unpause the contract
    function unpauseContract() public onlyOwner {
        _unpause();
    }

    // Function to add an account to the isValidator
    function addToValidators(address _account) external onlyOwner whenPaused {
        if (!isValidator[_account]) {
            isValidator[_account] = true;
            totalValidators++;
            emit ValidatorUpdated(_account, true);
        }
    }

    // Function to remove an account from the isValidator
    function removeFromValidators(address _account) external onlyOwner whenPaused {
        if (isValidator[_account]) {
            isValidator[_account] = false;
            totalValidators--;
            emit ValidatorUpdated(_account, false);
        }
    }

    // Function to add an account to the isRequester
    function addToRequesters(address _account) external onlyOwner {
        if (!isRequester[_account]) {
            isRequester[_account] = true;
            emit RequesterUpdated(_account, true);
        }
    }

    // Function to remove an account from the isRequester
    function removeFromRequesters(address _account) external onlyOwner {
        if (isRequester[_account]) {
            isRequester[_account] = false;
            emit RequesterUpdated(_account, false);
        }
    }

    /* View functions */
    
    // Get the consensus ratio information for a given ss requestNumber
    function getConsensusRatio(uint32 _requestNumber) external view returns (uint256, uint256, uint256) {
        Snapshot storage ss = snapshots[_requestNumber];
        return (ss.voteCount[ss.consensus_CS], // consensus vote count
                ss.totalVotes, // total votes
                // ratio in percentage rounded to the closest integer and prevention of division by zero (to prevent auto-revert)
                ss.totalVotes > 0 ? (ss.voteCount[ss.consensus_CS] * 100 + ss.totalVotes / 2) / ss.totalVotes : 0); 
    }
}
