# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please do **NOT** open a public GitHub issue.

Instead, please report it via email to: jk.fredericks@gmail.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

## Response Timeline

- **Acknowledgement**: Within 48 hours
- **Initial Assessment**: Within 7 days
- **Fix Timeline**: Depending on severity — urgent issues patched ASAP

## Security Best Practices for Contributors

- Never commit API keys or secrets to the repository
- Use environment variables for all sensitive configuration
- Validate all user input in both frontend and backend
- Follow the hexagonal architecture's dependency rules (domain never imports application/adapters)