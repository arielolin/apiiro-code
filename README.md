# Apiiro Code

## Overview

Apiiro Code is a Visual Studio Code extension that helps developers identify and manage risks directly in their IDE. The extension integrates with Apiiro's REST API to provide risk data visualization and remediation options for risky code.

## Design Constraints

- Must be compatible with popular IDEs (currently supporting VS Code)
- Requires valid Apiiro API token for authentication
- Should minimize performance impact on the IDE
- Must follow IDE extension development guidelines
- Must maintain compatibility with Apiiro's API and services
- Must only use existing data pipelines - no direct code/data transmission
- Must adhere to enterprise-grade data privacy standards, including GDPR compliance, data sovereignty requirements, and implement robust security controls for sensitive information handling
- Must rely solely on Apiiro's REST API for risk detection in codebase
- No local code parsing or scanning is performed within the IDE
- All risk detection and analysis happens on monitored branches through Apiiro's platform
- Extension acts as a visualization layer for remotely detected risks
- Risk data is retrieved and displayed based on:
  - Repository identification
  - Branch context
  - File paths
  - Line numbers

## Functional View

1. Repository Authentication Flow

   Start -> Validate Token -> Cache Authentication -> Ready
   |
   v
   Extract Git Info -> Query Apiiro API -> Match Repository

2. Risk Highlighting Flow

   File Change/Editor Open -> Request Risks from API -> Process Risks
   |
   v
   Group by Line -> Generate Tooltips -> Apply Visual Highlights

3. Risk Remediation Flow

   Risk Detected -> Get Fix Options -> Show in IDE (PR view)
   |
   v
   Apply Fix -> Update Line (remove highlight) -> Save Changes

## Logical View

### Key Components

1. Main module

   - Extension activation handling
   - Command registration
   - Service initialization

2. Risk Highlighting Module

   - Risk validation and grouping by line number
   - Line change tracking (via SCM Communication)
   - Markdown message generation
   - Decoration management

3. SCM Communication

   - Local Git Configuration and Diff Reader
   - Remote API Client
   - Line modification detection
   - Source code context management

4. Remediation Control Module
   - Fix suggestion generation
   - Code modification tracking
   - Remediation status management
   - Fix application handling

### Data Flow

1. Extension activation triggers on VS Code startup
2. User edits trigger risk analysis
3. Risks are validated and grouped by line number
4. UI decorations are applied to highlight risks
5. Hover providers show detailed risk information

## Deployment and Operational View

### Distribution and Installation

1. Primary Distribution Channel

   - Direct download from Apiiro platform
   - Installation through VS Code extension manager
   - (Future) Installation through Marketplace

2. Version Management
   - Automatic version check on extension startup
   - Notification system for available updates
   - Force update mechanism for critical versions
     - User notification of mandatory updates
     - Automatic update triggering
     - Graceful shutdown of outdated versions

### Operational Monitoring

1. Extension Health Checks

   - Connection status monitoring
   - Performance metrics collection
   - Error logging and reporting

2. Update Management

   - Version compatibility verification
   - Update availability and installation status

3. User Notifications
   - Update availability alerts
   - Installation status messages
   - Critical version warning system

### Technical Stack

- TypeScript as primary language
- VS Code Extension API
- Node.js runtime
- Webpack for bundling
- ESLint for code quality

## Security Considerations

- Secure API token storage
- Safe handling of markdown content
- Trusted string handling for risk messages
- Protected communication with Apiiro services

## Development

- Install dependencies: `npm install`
- Run the extension in development mode: `npm run watch`
- Test the extension in VS Code
- Build the extension: `npm run build`
- Publish the extension: `vsce publish`
