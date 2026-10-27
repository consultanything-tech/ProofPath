# ProofPath working guidance

## Model and reasoning selection

- For routine implementation and review, prefer GPT-6.1 Sol with high reasoning. For small edits and routine checks, medium reasoning is sufficient.
- For difficult architecture or security decisions, subtle failures, and final submission-readiness reviews, prefer GPT-6 Astra with high or xhigh reasoning when available.
- These are selection guidelines, not an instruction to switch the primary session model automatically. Follow the user's model-routing and delegation instructions; if a preferred model is unavailable, use the configured model and state any material limitation.

## Hackathon model requirement

Development assistants and the model used by ProofPath are separate. The submission's eligible Meta model requirement must be met by the product's actual Meta Model API and/or eligible Meta open-weight model integration. Fixture behavior or using GPT during development does not establish that integration. Describe model use and verification status accurately.
