PRIVATE_KEY_WALLET = $(shell cast wallet list | grep deployer)
BASE_SEPOLIA_RPC_URL = $(shell cat .env | grep BASE_SEPOLIA_RPC_URL | cut -d '=' -f2)


.PHONY: contract-test, contract-coverage, contract-build, contract-deploy

contract-test:
	(cd  ./contracts/ && forge test)

contract-coverage:
	(cd ./contracts/ && forge coverage)

contract-deploy:
	@if [ -z "$(PRIVATE_KEY_WALLET)" ] || [ -z "$(BASE_SEPOLIA_RPC_URL)" ] || [ -z "$(ETHERSCAN_API_KEY)" ]; then \
		echo "PRIVATE_KEY or BASE_SEPOLIA_RPC_URL or ETHERSCAN_API_KEY is not set. Set private key using 'cast wallet import deployer --interactive'"; \
		echo "Usage: make contract-deploy PRIVATE_KEY_WALLET=0x... BASE_SEPOLIA_RPC_URL=https://... ETHERSCAN_API_KEY=..."; \
		exit 1; \
	fi
	(cd ./contracts/ && forge script script/Deploy.s.sol --rpc-url $(BASE_SEPOLIA_RPC_URL) --account deployer --broadcast --verify --etherscan-api-key $(ETHERSCAN_API_KEY))

.PHONY: frontend
frontend:
	(cd ./frontend/ && bun run dev)

.PHONY: cre-workflow
cre-workflow:
	cre workflow simulate momofi-cre-workflow --target staging-settings

