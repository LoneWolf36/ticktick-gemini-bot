---
work_package_id: WP03
title: Mutation Normalizer
dependencies: "[WP01, WP02]"
subtasks: [T031, T032, T033, T034, T035]
---

# Work Package Prompt: WP03 — Mutation Normalizer

**Feature**: 002-natural-language-task-mutations
**Work Package**: WP03
**Title**: Mutation Normalizer
**Priority**: P0 — Foundation (required for all mutation operations)
**Dependencies**: WP01 (Intent Recognition), WP02 (Task Resolution) complete
**Parallelisable with**: None (foundational layer)
**Estimated Lines**: ~1,927 lines
**Subtasks**: 5 (T031-T035, ~385 lines each)

---

## Objective

Build the mutation normalization layer that transforms raw user intents into validated, normalized TickTick API operations. This module handles date arithmetic, field merging, validation, and change tracking to ensure all mutations are safe, consistent, and reversible.

**Key Responsibilities**:
1. Validate mutation payloads against TickTick API constraints
2. Normalize date operations (absolute, relative, clear)
3. Merge user changes with existing task data safely
4. Detect and prevent destructive operations
5. Generate diff summaries for user confirmations
6. Handle timezone conversions consistently
7. Support partial updates without data loss

**Design Principles**:
- **Defensive Validation**: Reject invalid payloads early with clear error messages
- **Explicit Over Implicit**: Date operations must be unambiguous
- **Preserve User Data**: Never overwrite fields the user didn't intend to change
- **Reversible Operations**: Track changes for undo functionality
- **Timezone Aware**: All date calculations respect user's timezone
- **Idempotent**: Applying the same mutation twice produces the same result
- **Testable**: Pure functions with deterministic outputs

**Architecture Position**:
```
Intent Recognition (WP01) → Task Resolution (WP02) → Mutation Normalizer (WP03) → Pipeline (WP04)
                                                                        ↓
                                                                TickTick Adapter
```

**Mutation Flow**:
```
Raw Intent → Validate Payload → Resolve Dates → Merge Changes → Normalize Output → Execute
     ↓            ↓               ↓              ↓               ↓                  ↓
  "done X"   Check required   Parse "tomorrow"  Deep merge    TickTick JSON    API call
             fields           Handle timezone   Detect conflicts  structure
```

---

## Implementation Steps

### T031: Create mutation-normalizer.js Module Structure

**Purpose**: Establish the foundational module structure with type definitions, constants, error handling utilities, and exported function signatures for the mutation normalization layer.

**Context**: This module serves as the core normalization engine for all task mutations (update/complete/delete/reschedule). It must provide clear type contracts, comprehensive error handling, and well-documented constants that define the mutation domain. The module structure enables consistent validation and transformation across all mutation types while maintaining separation of concerns for date resolution and change merging logic.

**Implementation Steps**:
1. Create `services/mutation-normalizer.js` with ESM module structure
2. Define all JSDoc type definitions for type safety without TypeScript
3. Export three primary functions: `normalizeMutation()`, `validateMutationPayload()`, `mergeChanges()`
4. Define mutation type constants (UPDATE, COMPLETE, DELETE, RESCHEDULE)
5. Define validation error codes and messages
6. Define supported update fields with TickTick API field mappings
7. Create error class hierarchy for mutation-specific errors
8. Implement utility functions for error creation and classification
9. Add module-level JSDoc documentation
10. Create companion test file structure

**Files to Create/Modify**:
- `services/mutation-normalizer.js` (NEW file, ~280 lines)
- `services/mutation-normalizer.test.js` (NEW file, ~100 lines for structure tests)

**Type Definitions** (JSDoc):
```javascript
/**
 * @typedef {Object} MutationPayload
 * @property {'UPDATE'|'COMPLETE'|'DELETE'|'RESCHEDULE'} type - Mutation operation type
 * @property {string} taskId - TickTick task ID to mutate
 * @property {Object} [changes] - Field changes to apply (for UPDATE/RESCHEDULE)
 * @property {string} [changes.title] - Updated task title
 * @property {string} [changes.content] - Updated task description
 * @property {number} [changes.priority] - Priority level (0-5)
 * @property {string[]} [changes.tags] - Task tags array
 * @property {Object} [changes.dueDate] - Due date specification
 * @property {'set_absolute'|'set_relative'|'clear'} changes.dueDate.operation
 * @property {string} [changes.dueDate.value] - Date value (ISO string or natural language)
 * @property {string} [changes.dueDate.timezone] - IANA timezone identifier
 * @property {boolean} [changes.dueDate.allDay] - Whether task is all-day
 * @property {boolean} [mergeContent] - Whether to append content (true) or replace (false)
 * @property {string} [entryPoint] - Origin of mutation (e.g., 'telegram:mutation')
 * @property {string} [userId] - Telegram user ID for logging
 */

/**
 * @typedef {Object} NormalizedMutation
 * @property {string} taskId - TickTick task ID
 * @property {'update'|'complete'|'delete'|'reschedule'} action - Normalized action type
 * @property {Object} payload - Normalized TickTick API payload
 * @property {Object} [payload.title] - Updated title
 * @property {Object} [payload.content] - Updated description
 * @property {Object} [payload.priority] - Updated priority
 * @property {Object} [payload.tags] - Updated tags
 * @property {Object} [payload.dueDate] - Updated due date (ISO 8601 with timezone)
 * @property {Object} [payload.completed] - Completion timestamp (for COMPLETE)
 * @property {Object} diff - Summary of changes made
 * @property {string[]} diff.added - Fields that were added
 * @property {string[]} diff.modified - Fields that were changed
 * @property {string[]} diff.removed - Fields that were cleared
 * @property {string} [warning] - Warning message if operation has risks
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether payload is valid
 * @property {ValidationError[]} errors - Array of validation errors
 * @property {ValidationWarning[]} warnings - Array of warnings (non-blocking)
 */

/**
 * @typedef {Object} ValidationError
 * @property {string} code - Error code (e.g., 'INVALID_TYPE', 'MISSING_FIELD')
 * @property {string} field - Field that failed validation
 * @property {string} message - Human-readable error message
 * @property {*} [value] - The invalid value provided
 */

/**
 * @typedef {Object} ValidationWarning
 * @property {string} code - Warning code
 * @property {string} field - Field related to warning
 * @property {string} message - Human-readable warning message
 */
```

**Constants Definition**:
```javascript
/**
 * Mutation operation types supported by the normalizer
 * @readonly
 * @enum {string}
 */
export const MUTATION_TYPES = {
  /** Update task fields (title, content, priority, tags, dueDate) */
  UPDATE: 'UPDATE',
  /** Mark task as completed (sets completed timestamp) */
  COMPLETE: 'COMPLETE',
  /** Permanently delete task (moves to TickTick trash) */
  DELETE: 'DELETE',
  /** Change task due date only (shorthand for UPDATE with dueDate) */
  RESCHEDULE: 'RESCHEDULE'
};

/**
 * Validation error codes for type-safe error handling
 * @readonly
 * @enum {string}
 */
export const VALIDATION_ERRORS = {
  // Type validation
  INVALID_TYPE: 'INVALID_TYPE',
  UNKNOWN_MUTATION_TYPE: 'UNKNOWN_MUTATION_TYPE',
  
  // Required field validation
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  MISSING_TASK_ID: 'MISSING_TASK_ID',
  
  // Field-specific validation
  INVALID_TASK_ID_FORMAT: 'INVALID_TASK_ID_FORMAT',
  INVALID_TITLE_LENGTH: 'INVALID_TITLE_LENGTH',
  INVALID_CONTENT_LENGTH: 'INVALID_CONTENT_LENGTH',
  INVALID_PRIORITY_VALUE: 'INVALID_PRIORITY_VALUE',
  INVALID_TAGS_FORMAT: 'INVALID_TAGS_FORMAT',
  INVALID_TAG_LENGTH: 'INVALID_TAG_LENGTH',
  
  // Date validation
  INVALID_DATE_OPERATION: 'INVALID_DATE_OPERATION',
  INVALID_DATE_VALUE: 'INVALID_DATE_VALUE',
  INVALID_TIMEZONE: 'INVALID_TIMEZONE',
  MISSING_DATE_VALUE: 'MISSING_DATE_VALUE',
  DATE_IN_PAST: 'DATE_IN_PAST',
  
  // Cross-field validation
  INCOMPATIBLE_FIELDS: 'INCOMPATIBLE_FIELDS',
  CONFLICTING_OPERATIONS: 'CONFLICTING_OPERATIONS',
  
  // Merge validation
  INVALID_MERGE_FLAG: 'INVALID_MERGE_FLAG',
  MERGE_ON_NON_CONTENT: 'MERGE_ON_NON_CONTENT'
};

/**
 * TickTick API fields that can be updated via mutations
 * Maps user-facing field names to TickTick API field names
 * @readonly
 * @enum {Object}
 */
export const SUPPORTED_UPDATE_FIELDS = {
  title: {
    apiField: 'title',
    type: 'string',
    minLength: 1,
    maxLength: 1000,
    required: false,
    trim: true
  },
  content: {
    apiField: 'content',
    type: 'string',
    minLength: 0,
    maxLength: 10000,
    required: false,
    trim: false
  },
  priority: {
    apiField: 'priority',
    type: 'number',
    min: 0,
    max: 5,
    integer: true,
    required: false,
    mapping: {
      none: 0,
      low: 1,
      medium: 2,
      high: 3,
      urgent: 4,
      critical: 5
    }
  },
  tags: {
    apiField: 'tags',
    type: 'array',
    itemType: 'string',
    minLength: 0,
    maxLength: 100,
    itemMaxLength: 50,
    required: false,
    unique: true,
    trim: true
  },
  dueDate: {
    apiField: 'dueDate',
    type: 'object',
    required: false,
    properties: {
      operation: {
        type: 'string',
        enum: ['set_absolute', 'set_relative', 'clear'],
        required: true
      },
      value: {
        type: 'string',
        required: false // Not required for 'clear' operation
      },
      timezone: {
        type: 'string',
        format: 'timezone',
        default: 'UTC',
        required: false
      },
      allDay: {
        type: 'boolean',
        default: false,
        required: false
      }
    }
  }
};

/**
 * Error messages mapped to error codes for consistent user feedback
 * @readonly
 * @type {Record<string, string>}
 */
export const ERROR_MESSAGES = {
  [VALIDATION_ERRORS.INVALID_TYPE]: 'Mutation type must be a string',
  [VALIDATION_ERRORS.UNKNOWN_MUTATION_TYPE]: 'Unknown mutation type: {{type}}. Supported types: UPDATE, COMPLETE, DELETE, RESCHEDULE',
  [VALIDATION_ERRORS.MISSING_REQUIRED_FIELD]: 'Required field missing: {{field}}',
  [VALIDATION_ERRORS.MISSING_TASK_ID]: 'Task ID is required for all mutations',
  [VALIDATION_ERRORS.INVALID_TASK_ID_FORMAT]: 'Task ID must be a non-empty string',
  [VALIDATION_ERRORS.INVALID_TITLE_LENGTH]: 'Title must be between {{min}} and {{max}} characters',
  [VALIDATION_ERRORS.INVALID_CONTENT_LENGTH]: 'Content must be between {{min}} and {{max}} characters',
  [VALIDATION_ERRORS.INVALID_PRIORITY_VALUE]: 'Priority must be an integer between {{min}} and {{max}}',
  [VALIDATION_ERRORS.INVALID_TAGS_FORMAT]: 'Tags must be an array of strings',
  [VALIDATION_ERRORS.INVALID_TAG_LENGTH]: 'Tag "{{tag}}" exceeds maximum length of {{max}} characters',
  [VALIDATION_ERRORS.INVALID_DATE_OPERATION]: 'Date operation must be one of: set_absolute, set_relative, clear',
  [VALIDATION_ERRORS.INVALID_DATE_VALUE]: 'Invalid date value: {{value}}',
  [VALIDATION_ERRORS.INVALID_TIMEZONE]: 'Invalid timezone: {{timezone}}',
  [VALIDATION_ERRORS.MISSING_DATE_VALUE]: 'Date value is required for set_absolute and set_relative operations',
  [VALIDATION_ERRORS.DATE_IN_PAST]: 'Scheduled date cannot be in the past',
  [VALIDATION_ERRORS.INCOMPATIBLE_FIELDS]: 'Fields {{field1}} and {{field2}} cannot be updated together',
  [VALIDATION_ERRORS.CONFLICTING_OPERATIONS]: 'Conflicting operations detected: {{operation1}} and {{operation2}}',
  [VALIDATION_ERRORS.INVALID_MERGE_FLAG]: 'mergeContent must be a boolean',
  [VALIDATION_ERRORS.MERGE_ON_NON_CONTENT]: 'mergeContent flag only applies to content field updates'
};
```

**Error Class Hierarchy**:
```javascript
/**
 * Base error class for mutation normalization errors
 * Provides structured error information for consistent handling
 */
export class MutationError extends Error {
  /**
   * @param {string} code - Error code from VALIDATION_ERRORS
   * @param {string} message - Human-readable message
   * @param {Object} [context] - Additional error context
   */
  constructor(code, message, context = {}) {
    super(message);
    this.name = 'MutationError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }

  /**
   * Convert error to plain object for logging/serialization
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp
    };
  }
}

/**
 * Validation error for invalid mutation payloads
 */
export class ValidationError extends MutationError {
  /**
   * @param {string} code - Error code
   * @param {string} field - Field that failed validation
   * @param {*} value - Invalid value provided
   * @param {Object} [context] - Additional context
   */
  constructor(code, field, value, context = {}) {
    const message = ERROR_MESSAGES[code] || 'Validation failed';
    super(code, message, { field, value, ...context });
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

/**
 * Date resolution error for invalid date operations
 */
export class DateError extends MutationError {
  /**
   * @param {string} code - Error code
   * @param {string} operation - Date operation type
   * @param {string} value - Date value that failed
   * @param {Object} [context] - Additional context
   */
  constructor(code, operation, value, context = {}) {
    const message = ERROR_MESSAGES[code] || 'Date resolution failed';
    super(code, message, { operation, value, ...context });
    this.name = 'DateError';
    this.operation = operation;
    this.value = value;
  }
}

/**
 * Merge conflict error for incompatible change merging
 */
export class MergeConflictError extends MutationError {
  /**
   * @param {string} code - Error code
   * @param {string[]} conflictingFields - Fields in conflict
   * @param {Object} [context] - Additional context
   */
  constructor(code, conflictingFields, context = {}) {
    const message = ERROR_MESSAGES[code] || 'Merge conflict detected';
    super(code, message, { conflictingFields, ...context });
    this.name = 'MergeConflictError';
    this.conflictingFields = conflictingFields;
  }
}

/**
 * Create a validation error with interpolated message
 * @param {string} code - Error code from VALIDATION_ERRORS
 * @param {string} field - Field that failed validation
 * @param {*} value - Invalid value
 * @param {Object} [interpolations] - Values for message template
 * @returns {ValidationError}
 */
export function createValidationError(code, field, value, interpolations = {}) {
  let message = ERROR_MESSAGES[code] || 'Validation failed';
  Object.entries(interpolations).forEach(([key, val]) => {
    message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
  });
  return new ValidationError(code, field, value, { interpolations });
}

/**
 * Create a date error with interpolated message
 * @param {string} code - Error code
 * @param {string} operation - Date operation
 * @param {string} value - Date value
 * @param {Object} [interpolations] - Message interpolations
 * @returns {DateError}
 */
export function createDateError(code, operation, value, interpolations = {}) {
  let message = ERROR_MESSAGES[code] || 'Date resolution failed';
  Object.entries(interpolations).forEach(([key, val]) => {
    message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
  });
  return new DateError(code, operation, value, { interpolations });
}

/**
 * Classify error by severity for handling decisions
 * @param {Error} error - Error to classify
 * @returns {'critical'|'recoverable'|'transient'}
 */
export function classifyError(error) {
  if (error instanceof ValidationError) {
    return 'recoverable'; // User can fix input
  }
  if (error instanceof DateError) {
    return 'recoverable'; // User can provide different date
  }
  if (error instanceof MergeConflictError) {
    return 'recoverable'; // System can suggest resolution
  }
  if (error.code === 'INVALID_TIMEZONE' || error.code === 'INVALID_DATE_VALUE') {
    return 'recoverable';
  }
  return 'critical'; // Unknown error, requires investigation
}
```

**Module Exports Structure**:
```javascript
// Primary functions (implemented in subsequent subtasks)
export function normalizeMutation(payload, existingTask, options = {}) {
  // Main normalization entry point
}

export function validateMutationPayload(payload) {
  // Validation logic
}

export function mergeChanges(existing, changes, options = {}) {
  // Change merging logic
}

// Date resolution (implemented in T033)
export function resolveDateOperation(operation, value, timezone, options = {}) {
  // Date operation resolver
}

// Utility exports
export {
  MUTATION_TYPES,
  VALIDATION_ERRORS,
  SUPPORTED_UPDATE_FIELDS,
  ERROR_MESSAGES,
  MutationError,
  ValidationError,
  DateError,
  MergeConflictError,
  createValidationError,
  createDateError,
  classifyError
};

// Internal utilities (not exported)
/**
 * Interpolate template string with values
 * @param {string} template - Template with {{placeholders}}
 * @param {Object} values - Values for interpolation
 * @returns {string}
 */
function interpolate(template, values) {
  let result = template;
  Object.entries(values).forEach(([key, val]) => {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
  });
  return result;
}

/**
 * Check if value is a plain object (not array, not null)
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep clone an object (simple implementation for mutation payloads)
 * @param {Object} obj - Object to clone
 * @returns {Object}
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => deepClone(item));
  const cloned = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}
```

**Validation Criteria**:
- [ ] Module file created at `services/mutation-normalizer.js`
- [ ] All constants defined and exported
- [ ] All JSDoc type definitions present
- [ ] Error class hierarchy implemented
- [ ] Three primary functions exported (stubs for now)
- [ ] Utility functions defined internally
- [ ] ESM module syntax used throughout
- [ ] No external dependencies beyond Node.js built-ins
- [ ] Test file structure created
- [ ] Module loads without syntax errors

**Edge Cases**:
- Circular references in payload → deepClone should handle gracefully
- Extremely long error messages → truncate for logging
- Missing ERROR_MESSAGES entry → fallback to generic message
- Null/undefined passed to utility functions → type checks prevent crashes

**Testing Notes**:
- Test each error class instantiation
- Verify error codes match VALIDATION_ERRORS enum
- Check message interpolation works correctly
- Ensure classifyError returns correct severity levels
- Validate deepClone handles nested objects and arrays

---

### T032: Implement validateMutationPayload() for Update/Complete/Delete Types

**Purpose**: Validate mutation payloads against TickTick API constraints, type-specific requirements, and cross-field compatibility rules before normalization proceeds.

**Context**: Validation is the first line of defense against invalid mutations. This function must catch all invalid inputs before they reach the TickTick API, providing clear error messages that help users understand what went wrong. Different mutation types have different validation requirements (e.g., COMPLETE needs no changes, UPDATE requires at least one change field). Cross-field validation prevents incompatible operations (e.g., clearing dueDate while setting priority).

**Implementation Steps**:
1. Implement main `validateMutationPayload(payload)` function
2. Add type validation (must be one of MUTATION_TYPES)
3. Add required field validation (taskId always required)
4. Implement type-specific validation rules:
   - UPDATE: requires changes object with at least one valid field
   - COMPLETE: no changes allowed (or only completed field)
   - DELETE: no changes allowed
   - RESCHEDULE: requires changes.dueDate with valid operation
5. Add field-level validators for each supported field
6. Implement cross-field validation (priority + dueDate compatibility)
7. Add validation for mergeContent flag
8. Generate ValidationResult with errors and warnings array
9. Implement warning generation for non-blocking issues
10. Add validation logging for debugging

**Files to Modify**:
- `services/mutation-normalizer.js` (+380 lines for validation logic)

**Validation Function Implementation**:
```javascript
/**
 * Validate a mutation payload against TickTick API constraints
 * @param {MutationPayload} payload - Mutation payload to validate
 * @returns {ValidationResult} Validation result with errors and warnings
 */
export function validateMutationPayload(payload) {
  const errors = [];
  const warnings = [];

  // Handle null/undefined payload
  if (!payload) {
    errors.push(createValidationError(
      VALIDATION_ERRORS.MISSING_REQUIRED_FIELD,
      'payload',
      null,
      { field: 'payload' }
    ));
    return { valid: false, errors, warnings };
  }

  // Validate mutation type
  const typeValidation = validateMutationType(payload.type);
  errors.push(...typeValidation.errors);
  warnings.push(...typeValidation.warnings);

  // Validate task ID (always required)
  const taskIdValidation = validateTaskId(payload.taskId);
  errors.push(...taskIdValidation.errors);
  warnings.push(...taskIdValidation.warnings);

  // Type-specific validation
  if (payload.type === MUTATION_TYPES.UPDATE) {
    const updateValidation = validateUpdateMutation(payload);
    errors.push(...updateValidation.errors);
    warnings.push(...updateValidation.warnings);
  } else if (payload.type === MUTATION_TYPES.COMPLETE) {
    const completeValidation = validateCompleteMutation(payload);
    errors.push(...completeValidation.errors);
    warnings.push(...completeValidation.warnings);
  } else if (payload.type === MUTATION_TYPES.DELETE) {
    const deleteValidation = validateDeleteMutation(payload);
    errors.push(...deleteValidation.errors);
    warnings.push(...deleteValidation.warnings);
  } else if (payload.type === MUTATION_TYPES.RESCHEDULE) {
    const rescheduleValidation = validateRescheduleMutation(payload);
    errors.push(...rescheduleValidation.errors);
    warnings.push(...rescheduleValidation.warnings);
  }

  // Validate mergeContent flag if present
  if (payload.mergeContent !== undefined) {
    const mergeValidation = validateMergeFlag(payload);
    errors.push(...mergeValidation.errors);
    warnings.push(...mergeValidation.warnings);
  }

  // Cross-field validation (only if no critical errors)
  if (errors.length === 0 && payload.changes) {
    const crossValidation = validateCrossFields(payload.changes);
    errors.push(...crossValidation.errors);
    warnings.push(...crossValidation.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate mutation type is one of supported types
 * @param {string} type - Mutation type to validate
 * @returns {ValidationResult}
 */
function validateMutationType(type) {
  const errors = [];
  const warnings = [];

  if (typeof type !== 'string') {
    errors.push(createValidationError(
      VALIDATION_ERRORS.INVALID_TYPE,
      'type',
      type
    ));
    return { errors, warnings };
  }

  const validTypes = Object.values(MUTATION_TYPES);
  if (!validTypes.includes(type)) {
    errors.push(createValidationError(
      VALIDATION_ERRORS.UNKNOWN_MUTATION_TYPE,
      'type',
      type,
      { type }
    ));
  }

  return { errors, warnings };
}

/**
 * Validate task ID format and presence
 * @param {string} taskId - Task ID to validate
 * @returns {ValidationResult}
 */
function validateTaskId(taskId) {
  const errors = [];
  const warnings = [];

  if (!taskId) {
    errors.push(createValidationError(
      VALIDATION_ERRORS.MISSING_TASK_ID,
      'taskId',
      taskId
    ));
    return { errors, warnings };
  }

  if (typeof taskId !== 'string') {
    errors.push(createValidationError(
      VALIDATION_ERRORS.INVALID_TASK_ID_FORMAT,
      'taskId',
      taskId
    ));
    return { errors, warnings };
  }

  if (taskId.trim().length === 0) {
    errors.push(createValidationError(
      VALIDATION_ERRORS.INVALID_TASK_ID_FORMAT,
      'taskId',
      taskId
    ));
  }

  return { errors, warnings };
}

/**
 * Validate UPDATE mutation specific requirements
 * @param {MutationPayload} payload - UPDATE mutation payload
 * @returns {ValidationResult}
 */
function validateUpdateMutation(payload) {
  const errors = [];
  const warnings = [];

  // UPDATE requires changes object
  if (!payload.changes || typeof payload.changes !== 'object') {
    errors.push(createValidationError(
      VALIDATION_ERRORS.MISSING_REQUIRED_FIELD,
      'changes',
      payload.changes,
      { field: 'changes' }
    ));
    return { errors, warnings };
  }

  // Must have at least one change field
  const changeFields = Object.keys(payload.changes);
  if (changeFields.length === 0) {
    errors.push(createValidationError(
      VALIDATION_ERRORS.MISSING_REQUIRED_FIELD,
      'changes',
      {},
      { message: 'UPDATE mutation must include at least one field to change' }
    ));
    return { errors, warnings };
  }

  // Validate each change field
  for (const field of changeFields) {
    if (!SUPPORTED_UPDATE_FIELDS[field]) {
      warnings.push({
        code: 'UNKNOWN_FIELD',
        field,
        message: `Unknown field '${field}' will be ignored`
      });
      continue;
    }

    const fieldValidation = validateField(
      field,
      payload.changes[field],
      SUPPORTED_UPDATE_FIELDS[field]
    );
    errors.push(...fieldValidation.errors);
    warnings.push(...fieldValidation.warnings);
  }

  return { errors, warnings };
}

/**
 * Validate COMPLETE mutation specific requirements
 * @param {MutationPayload} payload - COMPLETE mutation payload
 * @returns {ValidationResult}
 */
function validateCompleteMutation(payload) {
  const errors = [];
  const warnings = [];

  // COMPLETE should not have changes (or only completed field)
  if (payload.changes) {
    const allowedChangeFields = ['completed', 'completedTime'];
    const changeFields = Object.keys(payload.changes);
    const unexpectedFields = changeFields.filter(
      f => !allowedChangeFields.includes(f)
    );

    if (unexpectedFields.length > 0) {
      warnings.push({
        code: 'UNEXPECTED_CHANGES',
        field: 'changes',
        message: `COMPLETE mutation ignores changes to: ${unexpectedFields.join(', ')}`
      });
    }
  }

  return { errors, warnings };
}

/**
 * Validate DELETE mutation specific requirements
 * @param {MutationPayload} payload - DELETE mutation payload
 * @returns {ValidationResult}
 */
function validateDeleteMutation(payload) {
  const errors = [];
  const warnings = [];

  // DELETE should not have changes
  if (payload.changes && Object.keys(payload.changes).length > 0) {
    warnings.push({
      code: 'UNEXPECTED_CHANGES',
      field: 'changes',
      message: 'DELETE mutation ignores changes object'
    });
  }

  return { errors, warnings };
}

/**
 * Validate RESCHEDULE mutation specific requirements
 * @param {MutationPayload} payload - RESCHEDULE mutation payload
 * @returns {ValidationResult}
 */
function validateRescheduleMutation(payload) {
  const errors = [];
  const warnings = [];

  // RESCHEDULE requires changes.dueDate
  if (!payload.changes || !payload.changes.dueDate) {
    errors.push(createValidationError(
      VALIDATION_ERRORS.MISSING_REQUIRED_FIELD,
      'changes.dueDate',
      payload.changes,
      { field: 'changes.dueDate' }
    ));
    return { errors, warnings };
  }

  // Validate dueDate structure
  const dueDateValidation = validateField(
    'dueDate',
    payload.changes.dueDate,
    SUPPORTED_UPDATE_FIELDS.dueDate
  );
  errors.push(...dueDateValidation.errors);
  warnings.push(...dueDateValidation.warnings);

  return { errors, warnings };
}

/**
 * Validate mergeContent flag
 * @param {MutationPayload} payload - Mutation payload
 * @returns {ValidationResult}
 */
function validateMergeFlag(payload) {
  const errors = [];
  const warnings = [];

  if (typeof payload.mergeContent !== 'boolean') {
    errors.push(createValidationError(
      VALIDATION_ERRORS.INVALID_MERGE_FLAG,
      'mergeContent',
      payload.mergeContent
    ));
    return { errors, warnings };
  }

  // mergeContent only makes sense with content field updates
  if (payload.mergeContent && payload.changes && !payload.changes.content) {
    warnings.push({
      code: 'MERGE_WITHOUT_CONTENT',
      field: 'mergeContent',
      message: 'mergeContent flag has no effect without content field update'
    });
  }

  return { errors, warnings };
}

/**
 * Validate cross-field compatibility
 * @param {Object} changes - Changes object
 * @returns {ValidationResult}
 */
function validateCrossFields(changes) {
  const errors = [];
  const warnings = [];

  // Check for conflicting date operations
  if (changes.dueDate && changes.dueDate.operation === 'clear') {
    if (changes.dueDate.allDay !== undefined) {
      warnings.push({
        code: 'CONFLICTING_DATE_FLAGS',
        field: 'dueDate',
        message: 'allDay flag ignored when clearing dueDate'
      });
    }
  }

  // Check priority + dueDate combination (both can coexist, no conflict)
  // This is just a warning for potentially unintended combinations
  if (changes.priority !== undefined && changes.dueDate) {
    if (changes.priority >= 4 && changes.dueDate.operation === 'clear') {
      warnings.push({
        code: 'HIGH_PRIORITY_NO_DATE',
        field: 'priority',
        message: 'High priority task (urgent/critical) without due date'
      });
    }
  }

  return { errors, warnings };
}

/**
 * Validate a single field against its schema
 * @param {string} fieldName - Field name
 * @param {*} value - Field value
 * @param {Object} schema - Field schema from SUPPORTED_UPDATE_FIELDS
 * @returns {ValidationResult}
 */
function validateField(fieldName, value, schema) {
  const errors = [];
  const warnings = [];

  // Type check
  if (schema.type === 'string' && typeof value !== 'string') {
    errors.push(createValidationError(
      VALIDATION_ERRORS.INVALID_TYPE,
      fieldName,
      value,
      { expected: 'string', actual: typeof value }
    ));
    return { errors, warnings };
  }

  if (schema.type === 'number' && typeof value !== 'number') {
    errors.push(createValidationError(
      VALIDATION_ERRORS.INVALID_TYPE,
      fieldName,
      value,
      { expected: 'number', actual: typeof value }
    ));
    return { errors, warnings };
  }

  if (schema.type === 'array' && !Array.isArray(value)) {
    errors.push(createValidationError(
      VALIDATION_ERRORS.INVALID_TYPE,
      fieldName,
      value,
      { expected: 'array', actual: Array.isArray(value) ? 'object' : typeof value }
    ));
    return { errors, warnings };
  }

  if (schema.type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
    errors.push(createValidationError(
      VALIDATION_ERRORS.INVALID_TYPE,
      fieldName,
      value,
      { expected: 'object', actual: Array.isArray(value) ? 'array' : typeof value }
    ));
    return { errors, warnings };
  }

  // String length validation
  if (schema.type === 'string') {
    const trimmedValue = schema.trim ? value.trim() : value;
    if (trimmedValue.length < schema.minLength) {
      errors.push(createValidationError(
        VALIDATION_ERRORS.INVALID_TITLE_LENGTH,
        fieldName,
        value,
        { min: schema.minLength, max: schema.maxLength }
      ));
    }
    if (trimmedValue.length > schema.maxLength) {
      errors.push(createValidationError(
        VALIDATION_ERRORS.INVALID_TITLE_LENGTH,
        fieldName,
        value,
        { min: schema.minLength, max: schema.maxLength }
      ));
    }
  }

  // Number range validation
  if (schema.type === 'number') {
    if (value < schema.min || value > schema.max) {
      errors.push(createValidationError(
        VALIDATION_ERRORS.INVALID_PRIORITY_VALUE,
        fieldName,
        value,
        { min: schema.min, max: schema.max }
      ));
    }
    if (schema.integer && !Number.isInteger(value)) {
      errors.push(createValidationError(
        VALIDATION_ERRORS.INVALID_PRIORITY_VALUE,
        fieldName,
        value,
        { reason: 'must be an integer' }
      ));
    }
  }

  // Array validation
  if (schema.type === 'array') {
    // Check item types
    for (const item of value) {
      if (typeof item !== 'string') {
        errors.push(createValidationError(
          VALIDATION_ERRORS.INVALID_TAGS_FORMAT,
          fieldName,
          value,
          { reason: 'all items must be strings' }
        ));
        return { errors, warnings };
      }
      // Check item length
      if (schema.itemMaxLength && item.length > schema.itemMaxLength) {
        errors.push(createValidationError(
          VALIDATION_ERRORS.INVALID_TAG_LENGTH,
          fieldName,
          item,
          { tag: item.substring(0, 20), max: schema.itemMaxLength }
        ));
      }
    }
    // Check array length
    if (value.length > schema.maxLength) {
      errors.push(createValidationError(
        VALIDATION_ERRORS.INVALID_TAGS_FORMAT,
        fieldName,
        value,
        { reason: `maximum ${schema.maxLength} tags allowed` }
      ));
    }
    // Check uniqueness
    if (schema.unique) {
      const uniqueItems = new Set(value.map(item => item.toLowerCase().trim()));
      if (uniqueItems.size !== value.length) {
        warnings.push({
          code: 'DUPLICATE_ITEMS',
          field: fieldName,
          message: 'Duplicate values will be removed automatically'
        });
      }
    }
  }

  // Object validation (for dueDate)
  if (schema.type === 'object' && schema.properties) {
    const objValidation = validateObjectProperties(value, schema.properties);
    errors.push(...objValidation.errors);
    warnings.push(...objValidation.warnings);
  }

  return { errors, warnings };
}

/**
 * Validate object properties against schema
 * @param {Object} obj - Object to validate
 * @param {Object} properties - Property schemas
 * @returns {ValidationResult}
 */
function validateObjectProperties(obj, properties) {
  const errors = [];
  const warnings = [];

  // Check required properties
  for (const [propName, propSchema] of Object.entries(properties)) {
    const hasValue = obj[propName] !== undefined;

    if (propSchema.required && !hasValue) {
      errors.push(createValidationError(
        VALIDATION_ERRORS.MISSING_REQUIRED_FIELD,
        propName,
        undefined,
        { field: propName }
      ));
      continue;
    }

    if (hasValue) {
      const propValidation = validateField(propName, obj[propName], propSchema);
      errors.push(...propValidation.errors);
      warnings.push(...propValidation.warnings);

      // Enum validation
      if (propSchema.enum && !propSchema.enum.includes(obj[propName])) {
        errors.push(createValidationError(
          VALIDATION_ERRORS.INVALID_DATE_OPERATION,
          propName,
          obj[propName],
          { valid: propSchema.enum }
        ));
      }
    }
  }

  // Check for unknown properties
  const knownProps = new Set(Object.keys(properties));
  for (const propName of Object.keys(obj)) {
    if (!knownProps.has(propName)) {
      warnings.push({
        code: 'UNKNOWN_PROPERTY',
        field: propName,
        message: `Unknown property '${propName}' will be ignored`
      });
    }
  }

  return { errors, warnings };
}
```

**Validation Criteria**:
- [ ] validateMutationPayload() handles null/undefined payloads
- [ ] Type validation rejects unknown mutation types
- [ ] Task ID validation catches missing/invalid IDs
- [ ] UPDATE validation requires changes object with at least one field
- [ ] COMPLETE validation warns about unexpected changes
- [ ] DELETE validation warns about unexpected changes
- [ ] RESCHEDULE validation requires dueDate with valid operation
- [ ] Field validators check type, length, range constraints
- [ ] Array validators check item types, lengths, uniqueness
- [ ] Object validators check required properties, enums
- [ ] Cross-field validation detects incompatible combinations
- [ ] mergeContent flag validated for type and relevance
- [ ] Warnings generated for non-blocking issues
- [ ] ValidationResult structure matches type definition
- [ ] Error messages are clear and actionable
- [ ] No validation logic allows invalid data through

**Edge Cases**:
- Empty string taskId → caught by trim().length === 0 check
- Array with mixed types → caught by item type validation
- Nested null values → handled by type checks
- Unicode characters in strings → length checks count code points
- Very large arrays → maxLength validation prevents abuse
- Float priority values → integer check catches non-integers
- Timezone with typo → caught by timezone format validation (in T033)
- Case-insensitive mutation types → normalize to uppercase before validation

**Testing Notes**:
- Test each mutation type independently
- Test boundary values (min/max lengths, priority 0 and 5)
- Test invalid type combinations
- Test missing required fields
- Test unknown fields (should warn, not error)
- Test mergeContent with and without content field
- Test cross-field conflict scenarios

---

### T033: Implement Date Operation Resolver (set_absolute, set_relative, clear)

**Purpose**: Resolve date operations from natural language and structured inputs into normalized ISO 8601 timestamps with timezone handling for TickTick API consumption.

**Context**: Users express dates in many ways: "tomorrow", "next Friday", "+3 days", "end of month", or specific timestamps. The date resolver must parse all these formats, handle timezone conversions correctly, and produce consistent ISO 8601 output. This is critical for tasks that need to trigger at specific times across different timezones. The resolver must also handle all-day events correctly (no time component) and validate that dates are not in the past for new schedules.

**Implementation Steps**:
1. Implement `resolveDateOperation(operation, value, timezone, options)` function
2. Handle 'clear' operation (returns null to clear dueDate)
3. Handle 'set_absolute' with ISO 8601 strings
4. Handle 'set_absolute' with natural language parsing
5. Handle 'set_relative' with offset expressions (+3 days, -1 week)
6. Implement natural language date parsing (tomorrow, next Friday, etc.)
7. Add timezone conversion using Intl.DateTimeFormat
8. Handle all-day flag (strip time component)
9. Validate dates are not in past (configurable)
10. Return normalized date object with metadata

**Files to Modify**:
- `services/mutation-normalizer.js` (+420 lines for date resolution)

**Date Resolution Implementation**:
```javascript
/**
 * Resolve a date operation to a normalized TickTick due date
 * @param {'set_absolute'|'set_relative'|'clear'} operation - Date operation type
 * @param {string} [value] - Date value (natural language or ISO string)
 * @param {string} [timezone='UTC'] - IANA timezone identifier
 * @param {Object} [options] - Resolution options
 * @param {boolean} [options.allDay=false] - Whether task is all-day
 * @param {boolean} [options.allowPast=false] - Allow dates in the past
 * @param {Date} [options.now=new Date()] - Current time for relative calculations
 * @returns {Object} Resolved date information
 * @returns {string|null} returns.isoDate - ISO 8601 date string (null for 'clear')
 * @returns {boolean} returns.isAllDay - Whether date is all-day
 * @returns {string} returns.timezone - Timezone used for resolution
 * @returns {string} [returns.warning] - Warning if date is near boundary
 */
export function resolveDateOperation(operation, value, timezone = 'UTC', options = {}) {
  const {
    allDay = false,
    allowPast = false,
    now = new Date()
  } = options;

  // Validate operation type
  const validOperations = ['set_absolute', 'set_relative', 'clear'];
  if (!validOperations.includes(operation)) {
    throw createDateError(
      VALIDATION_ERRORS.INVALID_DATE_OPERATION,
      operation,
      value || '',
      { valid: validOperations }
    );
  }

  // Handle 'clear' operation
  if (operation === 'clear') {
    return {
      isoDate: null,
      isAllDay: false,
      timezone: 'UTC',
      operation: 'clear',
      warning: null
    };
  }

  // Validate value presence for non-clear operations
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw createDateError(
      VALIDATION_ERRORS.MISSING_DATE_VALUE,
      operation,
      value || '',
      { operation }
    );
  }

  // Validate timezone
  if (!isValidTimezone(timezone)) {
    throw createDateError(
      VALIDATION_ERRORS.INVALID_TIMEZONE,
      operation,
      value,
      { timezone }
    );
  }

  // Resolve date based on operation type
  let resolvedDate;
  if (operation === 'set_absolute') {
    resolvedDate = resolveAbsoluteDate(value, timezone, now);
  } else if (operation === 'set_relative') {
    resolvedDate = resolveRelativeDate(value, timezone, now);
  }

  // Validate resolved date
  if (!resolvedDate || isNaN(resolvedDate.getTime())) {
    throw createDateError(
      VALIDATION_ERRORS.INVALID_DATE_VALUE,
      operation,
      value,
      { reason: 'could not parse date' }
    );
  }

  // Check for past dates
  if (!allowPast && resolvedDate < now) {
    // Allow 5-minute grace period for edge cases
    const gracePeriod = 5 * 60 * 1000;
    if (now - resolvedDate > gracePeriod) {
      throw createDateError(
        VALIDATION_ERRORS.DATE_IN_PAST,
        operation,
        value,
        { resolvedDate: resolvedDate.toISOString(), now: now.toISOString() }
      );
    }
  }

  // Handle all-day flag
  let finalDate = resolvedDate;
  if (allDay) {
    finalDate = normalizeToAllDay(resolvedDate, timezone);
  }

  // Generate warning for near-future dates
  let warning = null;
  const timeUntilDate = finalDate.getTime() - now.getTime();
  const oneHour = 60 * 60 * 1000;
  if (timeUntilDate > 0 && timeUntilDate < oneHour) {
    warning = 'Date is within the next hour';
  }

  // Format as ISO 8601
  const isoDate = allDay 
    ? formatDateOnly(finalDate, timezone)
    : finalDate.toISOString();

  return {
    isoDate,
    isAllDay: allDay,
    timezone,
    operation,
    warning,
    parsedValue: value,
    resolvedTimestamp: finalDate.getTime()
  };
}

/**
 * Check if timezone identifier is valid
 * @param {string} timezone - IANA timezone identifier
 * @returns {boolean}
 */
function isValidTimezone(timezone) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Resolve absolute date from various input formats
 * @param {string} value - Date string (ISO or natural language)
 * @param {string} timezone - Timezone for interpretation
 * @param {Date} now - Current time reference
 * @returns {Date} Resolved date
 */
function resolveAbsoluteDate(value, timezone, now) {
  const trimmed = value.trim().toLowerCase();

  // Try ISO 8601 format first
  if (isISO8601(value)) {
    const isoDate = new Date(value);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }
  }

  // Try natural language parsing
  return parseNaturalLanguageDate(trimmed, timezone, now);
}

/**
 * Check if string is ISO 8601 format
 * @param {string} str - String to check
 * @returns {boolean}
 */
function isISO8601(str) {
  // Simple regex for common ISO 8601 formats
  const isoRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:?\d{2})?)?$/;
  return isoRegex.test(str);
}

/**
 * Parse natural language date expressions
 * @param {string} text - Natural language date text
 * @param {string} timezone - Timezone for interpretation
 * @param {Date} now - Current time reference
 * @returns {Date} Parsed date
 */
function parseNaturalLanguageDate(text, timezone, now) {
  // Handle special keywords
  const specialDates = {
    'today': getDateInTimezone(now, timezone),
    'tomorrow': addDays(getDateInTimezone(now, timezone), 1),
    'yesterday': addDays(getDateInTimezone(now, timezone), -1),
    'now': now
  };

  if (specialDates[text]) {
    return specialDates[text];
  }

  // Handle "next [weekday]" patterns
  const weekdayMatch = text.match(/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (weekdayMatch) {
    return getNextWeekday(weekdayMatch[1], timezone, now);
  }

  // Handle "this [weekday]" patterns
  const thisWeekdayMatch = text.match(/^this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  if (thisWeekdayMatch) {
    return getThisWeekday(thisWeekdayMatch[1], timezone, now);
  }

  // Handle "end of month" pattern
  if (text === 'end of month' || text === 'end of the month') {
    return getEndOfMonth(timezone, now);
  }

  // Handle "end of week" pattern
  if (text === 'end of week' || text === 'end of the week') {
    return getEndOfWeek(timezone, now);
  }

  // Handle "midnight" pattern
  if (text === 'midnight' || text === 'end of day' || text === 'eod') {
    return getEndOfDay(timezone, now);
  }

  // Handle "noon" pattern
  if (text === 'noon' || text === '12pm') {
    return getNoon(timezone, now);
  }

  // Handle relative patterns like "+3 days", "-2 weeks"
  const relativeMatch = text.match(/^([+-])\s*(\d+)\s*(day|days|week|weeks|month|months|year|years)$/);
  if (relativeMatch) {
    const sign = relativeMatch[1] === '+' ? 1 : -1;
    const amount = parseInt(relativeMatch[2], 10);
    const unit = relativeMatch[3].toLowerCase();
    return parseRelativeOffset(sign, amount, unit, timezone, now);
  }

  // Handle "in X days/weeks/months" pattern
  const inMatch = text.match(/^in\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)$/);
  if (inMatch) {
    const amount = parseInt(inMatch[1], 10);
    const unit = inMatch[2].toLowerCase();
    return parseRelativeOffset(1, amount, unit, timezone, now);
  }

  // Try parsing as date string (YYYY-MM-DD, MM/DD/YYYY, etc.)
  return parseDateString(text, timezone, now);
}

/**
 * Get date at start of day in specific timezone
 * @param {Date} date - Reference date
 * @param {string} timezone - Target timezone
 * @returns {Date} Start of day in timezone
 */
function getDateInTimezone(date, timezone) {
  const options = { 
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(date);
  const partValues = {};
  parts.forEach(part => {
    if (part.type !== 'literal') {
      partValues[part.type] = part.value;
    }
  });

  // Create date at start of day in timezone
  return new Date(Date.UTC(
    parseInt(partValues.year, 10),
    parseInt(partValues.month, 10) - 1,
    parseInt(partValues.day, 10),
    0, 0, 0, 0
  ));
}

/**
 * Add days to a date
 * @param {Date} date - Starting date
 * @param {number} days - Days to add (can be negative)
 * @returns {Date} New date
 */
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get next occurrence of weekday
 * @param {string} weekday - Weekday name
 * @param {string} timezone - Timezone
 * @param {Date} now - Current time
 * @returns {Date} Next weekday at start of day
 */
function getNextWeekday(weekday, timezone, now) {
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDay = weekdays.indexOf(weekday.toLowerCase());
  
  const today = getDateInTimezone(now, timezone);
  const currentDay = today.getDay();
  
  let daysUntilTarget = targetDay - currentDay;
  if (daysUntilTarget <= 0) {
    daysUntilTarget += 7; // Next week
  }
  
  return addDays(today, daysUntilTarget);
}

/**
 * Get this week's occurrence of weekday
 * @param {string} weekday - Weekday name
 * @param {string} timezone - Timezone
 * @param {Date} now - Current time
 * @returns {Date} This week's weekday at start of day
 */
function getThisWeekday(weekday, timezone, now) {
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDay = weekdays.indexOf(weekday.toLowerCase());
  
  const today = getDateInTimezone(now, timezone);
  const currentDay = today.getDay();
  
  let daysUntilTarget = targetDay - currentDay;
  if (daysUntilTarget < 0) {
    daysUntilTarget += 7; // Earlier this week (from last week's perspective)
  }
  
  return addDays(today, daysUntilTarget);
}

/**
 * Get end of month date
 * @param {string} timezone - Timezone
 * @param {Date} now - Current time
 * @returns {Date} Last day of current month
 */
function getEndOfMonth(timezone, now) {
  const today = getDateInTimezone(now, timezone);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return lastDay;
}

/**
 * Get end of week (Sunday)
 * @param {string} timezone - Timezone
 * @param {Date} now - Current time
 * @returns {Date} Sunday of current week
 */
function getEndOfWeek(timezone, now) {
  const today = getDateInTimezone(now, timezone);
  const dayOfWeek = today.getDay();
  const daysUntilSunday = 7 - dayOfWeek;
  return addDays(today, daysUntilSunday);
}

/**
 * Get end of day (11:59:59 PM)
 * @param {string} timezone - Timezone
 * @param {Date} now - Current time
 * @returns {Date} End of current day
 */
function getEndOfDay(timezone, now) {
  const today = getDateInTimezone(now, timezone);
  return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
}

/**
 * Get noon (12:00:00 PM)
 * @param {string} timezone - Timezone
 * @param {Date} now - Current time
 * @returns {Date} Noon of current day
 */
function getNoon(timezone, now) {
  const today = getDateInTimezone(now, timezone);
  return new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
}

/**
 * Parse relative offset (e.g., +3 days, -2 weeks)
 * @param {number} sign - 1 for positive, -1 for negative
 * @param {number} amount - Amount of units
 * @param {string} unit - Unit type (day, week, month, year)
 * @param {string} timezone - Timezone
 * @param {Date} now - Current time
 * @returns {Date} Resolved date
 */
function parseRelativeOffset(sign, amount, unit, timezone, now) {
  const today = getDateInTimezone(now, timezone);
  const result = new Date(today);
  
  const totalAmount = sign * amount;
  
  switch (unit.toLowerCase()) {
    case 'day':
    case 'days':
      result.setDate(result.getDate() + totalAmount);
      break;
    case 'week':
    case 'weeks':
      result.setDate(result.getDate() + (totalAmount * 7));
      break;
    case 'month':
    case 'months':
      result.setMonth(result.getMonth() + totalAmount);
      break;
    case 'year':
    case 'years':
      result.setFullYear(result.getFullYear() + totalAmount);
      break;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }
  
  return result;
}

/**
 * Resolve relative date expression
 * @param {string} value - Relative date expression
 * @param {string} timezone - Timezone
 * @param {Date} now - Current time
 * @returns {Date} Resolved date
 */
function resolveRelativeDate(value, timezone, now) {
  const trimmed = value.trim().toLowerCase();
  return parseNaturalLanguageDate(trimmed, timezone, now);
}

/**
 * Normalize date to all-day (strip time component)
 * @param {Date} date - Date to normalize
 * @param {string} timezone - Timezone
 * @returns {Date} All-day date
 */
function normalizeToAllDay(date, timezone) {
  return getDateInTimezone(date, timezone);
}

/**
 * Format date as YYYY-MM-DD string
 * @param {Date} date - Date to format
 * @param {string} timezone - Timezone
 * @returns {string} Formatted date string
 */
function formatDateOnly(date, timezone) {
  const options = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  };
  
  const formatter = new Intl.DateTimeFormat('en-CA', options); // en-CA gives YYYY-MM-DD
  return formatter.format(date);
}

/**
 * Parse date string in various formats
 * @param {string} text - Date string
 * @param {string} timezone - Timezone
 * @param {Date} now - Current time
 * @returns {Date} Parsed date
 */
function parseDateString(text, timezone, now) {
  // Try YYYY-MM-DD format
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
  }

  // Try MM/DD/YYYY format
  const usMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
  }

  // Try DD/MM/YYYY format (European)
  const euMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (euMatch) {
    const [, day, month, year] = euMatch;
    return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
  }

  // If no pattern matches, try native Date parsing as fallback
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  throw new Error(`Unable to parse date string: ${text}`);
}
```

**Validation Criteria**:
- [ ] 'clear' operation returns null isoDate
- [ ] 'set_absolute' handles ISO 8601 strings
- [ ] 'set_absolute' handles natural language (today, tomorrow, next Friday)
- [ ] 'set_relative' handles offset expressions (+3 days, in 2 weeks)
- [ ] Timezone validation rejects invalid IANA identifiers
- [ ] All-day flag strips time component correctly
- [ ] Past date validation works with grace period
- [ ] Natural language parsing handles all documented patterns
- [ ] Date arithmetic handles month/year boundaries correctly
- [ ] ISO 8601 output format is correct
- [ ] Warnings generated for near-future dates
- [ ] Error messages include context for debugging
- [ ] Timezone conversion uses Intl.DateTimeFormat correctly
- [ ] Edge cases handled (leap years, DST transitions)

**Edge Cases**:
- "next Monday" when today is Monday → returns next week's Monday
- "this Monday" when today is Tuesday → returns yesterday's Monday
- "+1 month" on Jan 31 → returns Feb 28 (or 29 in leap year)
- DST transition dates → handled by Intl.DateTimeFormat
- Invalid timezone strings → caught by isValidTimezone()
- Malformed ISO strings → caught by isISO8601() check
- Empty value strings → caught by validation before resolver
- Unicode in date strings → handled by trim() and toLowerCase()

**Testing Notes**:
- Test each natural language pattern independently
- Test timezone conversions across major timezones (UTC, EST, PST, IST)
- Test boundary dates (end of month, leap year)
- Test DST transition dates
- Test past date rejection with grace period
- Test all-day formatting
- Test relative offset calculations
- Test error cases (invalid timezone, unparseable dates)

---

### T034: Implement Change Merging Logic (Preserve Existing Fields, mergeContent Flag)

**Purpose**: Safely merge user-provided changes with existing task data, handling deep merges, content appending vs replacing, explicit null clears, and conflict detection.

**Context**: When users update tasks, they typically want to change only specific fields while preserving everything else. The merge logic must handle nested objects (like dueDate), support content appending (for adding notes), allow explicit null to clear fields, and detect potential conflicts. This ensures mutations are safe and don't accidentally delete user data.

**Implementation Steps**:
1. Implement `mergeChanges(existing, changes, options)` function
2. Handle deep merge for nested objects
3. Implement mergeContent flag (append vs replace for content field)
4. Handle explicit null to clear fields
5. Detect and warn about potential conflicts
6. Generate diff summary of changes
7. Preserve fields not mentioned in changes
8. Handle array merging (tags: replace vs append)
9. Validate merge result against schema
10. Return merged object with diff metadata

**Files to Modify**:
- `services/mutation-normalizer.js` (+380 lines for merge logic)

**Merge Implementation**:
```javascript
/**
 * Merge user changes with existing task data
 * @param {Object} existing - Existing task data from TickTick
 * @param {Object} changes - User-provided changes to apply
 * @param {Object} [options] - Merge options
 * @param {boolean} [options.mergeContent=false] - Append to content (true) or replace (false)
 * @param {boolean} [options.preserveTags=false] - Preserve existing tags and append new ones
 * @param {boolean} [options.strict=false] - Throw on conflicts (true) or warn (false)
 * @returns {Object} Merged task data with diff metadata
 * @returns {Object} returns.merged - Merged task data
 * @returns {Object} returns.diff - Summary of changes made
 * @returns {string[]} returns.diff.added - Fields that were added
 * @returns {string[]} returns.diff.modified - Fields that were changed
 * @returns {string[]} returns.diff.removed - Fields that were cleared
 * @returns {Object[]} returns.conflicts - Detected conflicts (if any)
 */
export function mergeChanges(existing, changes, options = {}) {
  const {
    mergeContent = false,
    preserveTags = false,
    strict = false
  } = options;

  // Validate inputs
  if (!existing || typeof existing !== 'object') {
    throw new MergeConflictError(
      VALIDATION_ERRORS.INVALID_TYPE,
      ['existing'],
      { expected: 'object', actual: typeof existing }
    );
  }

  if (!changes || typeof changes !== 'object') {
    throw new MergeConflictError(
      VALIDATION_ERRORS.INVALID_TYPE,
      ['changes'],
      { expected: 'object', actual: typeof changes }
    );
  }

  // Initialize diff tracking
  const diff = {
    added: [],
    modified: [],
    removed: []
  };
  const conflicts = [];

  // Create deep clone of existing to avoid mutation
  const merged = deepClone(existing);

  // Process each change field
  for (const [key, value] of Object.entries(changes)) {
    // Skip undefined values (no change)
    if (value === undefined) {
      continue;
    }

    // Handle explicit null (clear field)
    if (value === null) {
      if (key in merged) {
        delete merged[key];
        diff.removed.push(key);
      }
      continue;
    }

    // Track whether field existed before
    const fieldExisted = key in merged;

    // Special handling for content field with mergeContent flag
    if (key === 'content' && mergeContent) {
      const existingContent = merged[key] || '';
      const newContent = value || '';
      
      // Append with separator if both have content
      if (existingContent && newContent) {
        merged[key] = `${existingContent}\n\n${newContent}`;
      } else {
        merged[key] = existingContent || newContent;
      }
      
      if (fieldExisted) {
        diff.modified.push(key);
      } else {
        diff.added.push(key);
      }
      continue;
    }

    // Special handling for tags array with preserveTags flag
    if (key === 'tags' && preserveTags && Array.isArray(merged[key]) && Array.isArray(value)) {
      const existingTags = merged[key];
      const newTags = value;
      
      // Merge tags, avoiding duplicates
      const existingTagSet = new Set(existingTags.map(t => t.toLowerCase()));
      const uniqueNewTags = newTags.filter(tag => !existingTagSet.has(tag.toLowerCase()));
      merged[key] = [...existingTags, ...uniqueNewTags];
      
      if (fieldExisted) {
        diff.modified.push(key);
      } else {
        diff.added.push(key);
      }
      continue;
    }

    // Handle nested objects (deep merge)
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      const nestedMerge = mergeChanges(merged[key], value, options);
      merged[key] = nestedMerge.merged;
      
      // Propagate nested diff with key prefix
      nestedMerge.diff.added.forEach(f => diff.added.push(`${key}.${f}`));
      nestedMerge.diff.modified.forEach(f => diff.modified.push(`${key}.${f}`));
      nestedMerge.diff.removed.forEach(f => diff.removed.push(`${key}.${f}`));
      conflicts.push(...nestedMerge.conflicts);
      continue;
    }

    // Handle array replacement (default behavior)
    if (Array.isArray(value)) {
      merged[key] = deepClone(value);
      if (fieldExisted) {
        diff.modified.push(key);
      } else {
        diff.added.push(key);
      }
      continue;
    }

    // Simple value assignment
    merged[key] = deepClone(value);
    if (fieldExisted && JSON.stringify(existing[key]) !== JSON.stringify(value)) {
      diff.modified.push(key);
    } else if (!fieldExisted) {
      diff.added.push(key);
    }
  }

  // Detect potential conflicts
  const detectedConflicts = detectConflicts(existing, changes, merged);
  if (detectedConflicts.length > 0) {
    conflicts.push(...detectedConflicts);
    
    if (strict) {
      throw new MergeConflictError(
        VALIDATION_ERRORS.CONFLICTING_OPERATIONS,
        conflicts.map(c => c.field),
        { conflicts }
      );
    }
  }

  return {
    merged,
    diff,
    conflicts
  };
}

/**
 * Detect potential conflicts in merge operation
 * @param {Object} existing - Existing data
 * @param {Object} changes - Changes applied
 * @param {Object} merged - Result after merge
 * @returns {Object[]} Array of conflict objects
 */
function detectConflicts(existing, changes, merged) {
  const conflicts = [];

  // Check for destructive operations
  if (changes.dueDate && changes.dueDate.operation === 'clear') {
    if (existing.dueDate && !changes.dueDate.skipWarning) {
      conflicts.push({
        field: 'dueDate',
        type: 'destructive',
        severity: 'warning',
        message: 'Clearing due date from task',
        oldValue: existing.dueDate,
        newValue: null
      });
    }
  }

  // Check for priority changes without due date
  if (changes.priority !== undefined && changes.priority >= 4) {
    if (!merged.dueDate && existing.dueDate === null) {
      conflicts.push({
        field: 'priority',
        type: 'recommendation',
        severity: 'info',
        message: 'High priority task without due date',
        suggestion: 'Consider adding a due date for urgent tasks'
      });
    }
  }

  // Check for content truncation
  if (changes.content && !changes.mergeContent) {
    const existingLength = (existing.content || '').length;
    const newLength = changes.content.length;
    if (newLength < existingLength * 0.5 && existingLength > 100) {
      conflicts.push({
        field: 'content',
        type: 'destructive',
        severity: 'warning',
        message: 'Content significantly reduced',
        oldValue: `${existingLength} characters`,
        newValue: `${newLength} characters`,
        suggestion: 'Use mergeContent: true to append instead of replace'
      });
    }
  }

  // Check for tag removal
  if (changes.tags && Array.isArray(changes.tags)) {
    const existingTags = existing.tags || [];
    const newTags = changes.tags;
    const removedTags = existingTags.filter(
      tag => !newTags.some(t => t.toLowerCase() === tag.toLowerCase())
    );
    
    if (removedTags.length > 2) {
      conflicts.push({
        field: 'tags',
        type: 'destructive',
        severity: 'warning',
        message: 'Multiple tags removed',
        removedTags,
        suggestion: 'Use preserveTags: true to append instead of replace'
      });
    }
  }

  // Check for title changes on completed tasks
  if (changes.title && existing.completed) {
    conflicts.push({
      field: 'title',
      type: 'unusual',
      severity: 'info',
      message: 'Changing title on completed task',
      suggestion: 'Consider creating a new task instead'
    });
  }

  return conflicts;
}

/**
 * Generate human-readable diff summary
 * @param {Object} diff - Diff object from mergeChanges
 * @param {Object} existing - Original data
 * @param {Object} merged - Merged data
 * @returns {string} Human-readable summary
 */
export function generateDiffSummary(diff, existing, merged) {
  const parts = [];

  if (diff.added.length > 0) {
    parts.push(`Added: ${diff.added.join(', ')}`);
  }

  if (diff.modified.length > 0) {
    const modifications = diff.modified.map(field => {
      const oldValue = getNestedValue(existing, field);
      const newValue = getNestedValue(merged, field);
      return `${field}: ${formatValue(oldValue)} → ${formatValue(newValue)}`;
    });
    parts.push(`Modified: ${modifications.join('; ')}`);
  }

  if (diff.removed.length > 0) {
    parts.push(`Removed: ${diff.removed.join(', ')}`);
  }

  if (parts.length === 0) {
    return 'No changes';
  }

  return parts.join(' | ');
}

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to query
 * @param {string} path - Dot-separated path (e.g., 'dueDate.isoDate')
 * @returns {*} Value at path or undefined
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
}

/**
 * Format value for display in diff summary
 * @param {*} value - Value to format
 * @returns {string} Formatted value
 */
function formatValue(value) {
  if (value === null || value === undefined) {
    return '∅';
  }
  if (typeof value === 'string') {
    if (value.length > 30) {
      return `"${value.substring(0, 27)}..."`;
    }
    return `"${value}"`;
  }
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  if (typeof value === 'object') {
    return `{${Object.keys(value).length} props}`;
  }
  return String(value);
}

/**
 * Create a rollback snapshot for undo functionality
 * @param {Object} existing - Original data before merge
 * @param {Object} diff - Diff from merge operation
 * @returns {Object} Rollback snapshot
 */
export function createRollbackSnapshot(existing, diff) {
  return {
    timestamp: new Date().toISOString(),
    originalState: deepClone(existing),
    diff: deepClone(diff),
    canRollback: true
  };
}

/**
 * Apply rollback to restore original state
 * @param {Object} currentState - Current merged state
 * @param {Object} snapshot - Rollback snapshot
 * @returns {Object} Restored state
 */
export function applyRollback(currentState, snapshot) {
  if (!snapshot || !snapshot.canRollback) {
    throw new Error('Invalid or expired rollback snapshot');
  }
  
  // Deep clone to avoid mutation
  return deepClone(snapshot.originalState);
}

/**
 * Validate merge result against TickTick schema
 * @param {Object} merged - Merged task data
 * @returns {ValidationResult} Validation result
 */
export function validateMergeResult(merged) {
  const errors = [];
  const warnings = [];

  // Check required TickTick fields
  if (!merged.id) {
    errors.push({
      code: 'MISSING_ID',
      field: 'id',
      message: 'Task ID is required for TickTick API'
    });
  }

  // Check title constraints
  if (merged.title) {
    if (typeof merged.title !== 'string') {
      errors.push({
        code: 'INVALID_TYPE',
        field: 'title',
        message: 'Title must be a string'
      });
    } else if (merged.title.length > 1000) {
      errors.push({
        code: 'TITLE_TOO_LONG',
        field: 'title',
        message: 'Title exceeds 1000 character limit'
      });
    }
  }

  // Check content constraints
  if (merged.content && typeof merged.content !== 'string') {
    errors.push({
      code: 'INVALID_TYPE',
      field: 'content',
      message: 'Content must be a string'
    });
  }

  // Check priority constraints
  if (merged.priority !== undefined) {
    if (!Number.isInteger(merged.priority)) {
      errors.push({
        code: 'INVALID_TYPE',
        field: 'priority',
        message: 'Priority must be an integer'
      });
    } else if (merged.priority < 0 || merged.priority > 5) {
      errors.push({
        code: 'PRIORITY_OUT_OF_RANGE',
        field: 'priority',
        message: 'Priority must be between 0 and 5'
      });
    }
  }

  // Check tags constraints
  if (merged.tags !== undefined) {
    if (!Array.isArray(merged.tags)) {
      errors.push({
        code: 'INVALID_TYPE',
        field: 'tags',
        message: 'Tags must be an array'
      });
    } else {
      const invalidTags = merged.tags.filter(t => typeof t !== 'string');
      if (invalidTags.length > 0) {
        errors.push({
          code: 'INVALID_TAG_TYPE',
          field: 'tags',
          message: 'All tags must be strings'
        });
      }
      if (merged.tags.length > 100) {
        errors.push({
          code: 'TOO_MANY_TAGS',
          field: 'tags',
          message: 'Maximum 100 tags allowed'
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
```

**Validation Criteria**:
- [ ] Deep merge works for nested objects (dueDate, etc.)
- [ ] mergeContent flag appends to existing content
- [ ] Explicit null clears fields correctly
- [ ] preserveTags flag appends tags instead of replacing
- [ ] Diff tracking captures all changes accurately
- [ ] Conflict detection identifies destructive operations
- [ ] Strict mode throws on conflicts
- [ ] Non-strict mode warns but proceeds
- [ ] Rollback snapshot captures original state
- [ ] applyRollback restores original state
- [ ] generateDiffSummary produces readable output
- [ ] validateMergeResult catches schema violations
- [ ] Arrays are deep cloned (not reference copied)
- [ ] Undefined values are skipped (no change)
- [ ] Nested diff paths use dot notation

**Edge Cases**:
- Merging into empty existing object → all fields are "added"
- Empty changes object → no changes, empty diff
- Circular references in objects → deepClone should handle or throw gracefully
- Very large content appends → no size limit enforced (TickTick API will reject)
- Concurrent modifications → not detected (optimistic locking not implemented)
- Unicode in content → preserved correctly
- Null vs undefined → null clears, undefined skips
- Array with duplicate tags → preserved (TickTick may dedupe server-side)

**Testing Notes**:
- Test deep merge with multiple nesting levels
- Test mergeContent with various content combinations
- Test preserveTags with overlapping tag sets
- Test explicit null for each field type
- Test conflict detection scenarios
- Test rollback and re-apply
- Test diff summary formatting
- Test validation edge cases

---

### T035: Write Mutation Normalizer Tests (50+ Tests)

**Purpose**: Comprehensive test coverage for validation, date resolution, merge logic, and edge cases to ensure mutation normalizer behaves correctly across all scenarios.

**Context**: The mutation normalizer is a critical layer that transforms user intents into TickTick API operations. Bugs here can cause data loss, incorrect dates, or failed mutations. Comprehensive tests ensure the module handles all documented cases correctly and provide regression protection as the codebase evolves.

**Implementation Steps**:
1. Create test file structure at `services/mutation-normalizer.test.js`
2. Write validation tests (20+ tests)
3. Write date resolution tests (15+ tests)
4. Write merge scenario tests (15+ tests)
5. Write edge case tests (10+ tests)
6. Add integration tests for full normalization flow
7. Add error handling tests
8. Add performance tests for large payloads
9. Document test cases with clear descriptions
10. Ensure 100% branch coverage on critical paths

**Files to Create**:
- `services/mutation-normalizer.test.js` (NEW file, ~450 lines)

**Test Suite Structure**:
```javascript
/**
 * Mutation Normalizer Test Suite
 * Comprehensive tests for validation, date resolution, and merge logic
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMutationPayload,
  resolveDateOperation,
  mergeChanges,
  generateDiffSummary,
  createRollbackSnapshot,
  applyRollback,
  validateMergeResult,
  MUTATION_TYPES,
  VALIDATION_ERRORS,
  ValidationError,
  DateError,
  MergeConflictError
} from './mutation-normalizer.js';

describe('Mutation Normalizer', () => {
  describe('validateMutationPayload', () => {
    describe('Type Validation', () => {
      it('should reject null payload', () => {
        const result = validateMutationPayload(null);
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors.length, 1);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.MISSING_REQUIRED_FIELD);
      });

      it('should reject undefined payload', () => {
        const result = validateMutationPayload(undefined);
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors.length, 1);
      });

      it('should reject non-string mutation type', () => {
        const result = validateMutationPayload({
          type: 123,
          taskId: 'task-123'
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.INVALID_TYPE);
      });

      it('should reject unknown mutation type', () => {
        const result = validateMutationPayload({
          type: 'INVALID_TYPE',
          taskId: 'task-123'
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.UNKNOWN_MUTATION_TYPE);
      });

      it('should accept all valid mutation types', () => {
        const validTypes = [
          MUTATION_TYPES.UPDATE,
          MUTATION_TYPES.COMPLETE,
          MUTATION_TYPES.DELETE,
          MUTATION_TYPES.RESCHEDULE
        ];

        for (const type of validTypes) {
          const result = validateMutationPayload({
            type,
            taskId: 'task-123'
          });
          // May have other errors, but type should be valid
          const typeError = result.errors.find(e => 
            e.code === VALIDATION_ERRORS.INVALID_TYPE || 
            e.code === VALIDATION_ERRORS.UNKNOWN_MUTATION_TYPE
          );
          assert.strictEqual(typeError, undefined, `Type ${type} should be valid`);
        }
      });
    });

    describe('Task ID Validation', () => {
      it('should reject missing task ID', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.MISSING_TASK_ID);
      });

      it('should reject empty string task ID', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: ''
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.INVALID_TASK_ID_FORMAT);
      });

      it('should reject whitespace-only task ID', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: '   '
        });
        assert.strictEqual(result.valid, false);
      });

      it('should reject non-string task ID', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 12345
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.INVALID_TASK_ID_FORMAT);
      });

      it('should accept valid task ID', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-abc-123'
        });
        // May have other errors (missing changes), but task ID should be valid
        const taskIdError = result.errors.find(e => 
          e.code === VALIDATION_ERRORS.MISSING_TASK_ID ||
          e.code === VALIDATION_ERRORS.INVALID_TASK_ID_FORMAT
        );
        assert.strictEqual(taskIdError, undefined);
      });
    });

    describe('UPDATE Mutation Validation', () => {
      it('should reject UPDATE without changes', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123'
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.MISSING_REQUIRED_FIELD);
      });

      it('should reject UPDATE with empty changes object', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {}
        });
        assert.strictEqual(result.valid, false);
      });

      it('should accept UPDATE with valid title change', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            title: 'Updated task title'
          }
        });
        assert.strictEqual(result.valid, true);
      });

      it('should reject title exceeding max length', () => {
        const longTitle = 'a'.repeat(1001);
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            title: longTitle
          }
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.INVALID_TITLE_LENGTH);
      });

      it('should reject empty title', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            title: ''
          }
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.INVALID_TITLE_LENGTH);
      });

      it('should accept valid priority values', () => {
        for (const priority of [0, 1, 2, 3, 4, 5]) {
          const result = validateMutationPayload({
            type: MUTATION_TYPES.UPDATE,
            taskId: 'task-123',
            changes: {
              priority
            }
          });
          assert.strictEqual(result.valid, true, `Priority ${priority} should be valid`);
        }
      });

      it('should reject priority out of range', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            priority: 6
          }
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.INVALID_PRIORITY_VALUE);
      });

      it('should reject float priority', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            priority: 3.5
          }
        });
        assert.strictEqual(result.valid, false);
      });

      it('should accept valid tags array', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            tags: ['work', 'urgent', 'meeting']
          }
        });
        assert.strictEqual(result.valid, true);
      });

      it('should reject non-array tags', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            tags: 'work,urgent'
          }
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.INVALID_TAGS_FORMAT);
      });

      it('should reject tags with non-string items', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            tags: ['work', 123, 'urgent']
          }
        });
        assert.strictEqual(result.valid, false);
      });

      it('should warn about duplicate tags', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            tags: ['work', 'Work', 'WORK']
          }
        });
        assert.strictEqual(result.valid, true);
        const duplicateWarning = result.warnings.find(w => w.code === 'DUPLICATE_ITEMS');
        assert.notStrictEqual(duplicateWarning, undefined);
      });

      it('should accept valid dueDate with set_absolute', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            dueDate: {
              operation: 'set_absolute',
              value: '2025-04-15T10:00:00Z',
              timezone: 'America/New_York',
              allDay: false
            }
          }
        });
        assert.strictEqual(result.valid, true);
      });

      it('should accept valid dueDate with set_relative', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            dueDate: {
              operation: 'set_relative',
              value: 'tomorrow',
              timezone: 'UTC'
            }
          }
        });
        assert.strictEqual(result.valid, true);
      });

      it('should reject invalid date operation', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            dueDate: {
              operation: 'invalid_op',
              value: '2025-04-15'
            }
          }
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.INVALID_DATE_OPERATION);
      });

      it('should reject missing date value for set_absolute', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            dueDate: {
              operation: 'set_absolute'
            }
          }
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.MISSING_DATE_VALUE);
      });

      it('should accept clear operation without value', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            dueDate: {
              operation: 'clear'
            }
          }
        });
        assert.strictEqual(result.valid, true);
      });
    });

    describe('COMPLETE Mutation Validation', () => {
      it('should accept COMPLETE without changes', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.COMPLETE,
          taskId: 'task-123'
        });
        assert.strictEqual(result.valid, true);
      });

      it('should warn about unexpected changes in COMPLETE', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.COMPLETE,
          taskId: 'task-123',
          changes: {
            title: 'Updated title'
          }
        });
        assert.strictEqual(result.valid, true);
        const warning = result.warnings.find(w => w.code === 'UNEXPECTED_CHANGES');
        assert.notStrictEqual(warning, undefined);
      });
    });

    describe('DELETE Mutation Validation', () => {
      it('should accept DELETE without changes', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.DELETE,
          taskId: 'task-123'
        });
        assert.strictEqual(result.valid, true);
      });

      it('should warn about unexpected changes in DELETE', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.DELETE,
          taskId: 'task-123',
          changes: {
            title: 'Updated title'
          }
        });
        assert.strictEqual(result.valid, true);
        const warning = result.warnings.find(w => w.code === 'UNEXPECTED_CHANGES');
        assert.notStrictEqual(warning, undefined);
      });
    });

    describe('RESCHEDULE Mutation Validation', () => {
      it('should reject RESCHEDULE without dueDate', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.RESCHEDULE,
          taskId: 'task-123',
          changes: {}
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.MISSING_REQUIRED_FIELD);
      });

      it('should accept RESCHEDULE with valid dueDate', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.RESCHEDULE,
          taskId: 'task-123',
          changes: {
            dueDate: {
              operation: 'set_absolute',
              value: '2025-04-15T10:00:00Z'
            }
          }
        });
        assert.strictEqual(result.valid, true);
      });
    });

    describe('mergeContent Flag Validation', () => {
      it('should reject non-boolean mergeContent', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            content: 'New content'
          },
          mergeContent: 'yes'
        });
        assert.strictEqual(result.valid, false);
        assert.strictEqual(result.errors[0].code, VALIDATION_ERRORS.INVALID_MERGE_FLAG);
      });

      it('should warn about mergeContent without content field', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            title: 'New title'
          },
          mergeContent: true
        });
        assert.strictEqual(result.valid, true);
        const warning = result.warnings.find(w => w.code === 'MERGE_WITHOUT_CONTENT');
        assert.notStrictEqual(warning, undefined);
      });

      it('should accept mergeContent with content field', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            content: 'Additional notes'
          },
          mergeContent: true
        });
        assert.strictEqual(result.valid, true);
      });
    });

    describe('Cross-Field Validation', () => {
      it('should warn about high priority without due date', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            priority: 5,
            dueDate: {
              operation: 'clear'
            }
          }
        });
        assert.strictEqual(result.valid, true);
        const warning = result.warnings.find(w => w.code === 'HIGH_PRIORITY_NO_DATE');
        assert.notStrictEqual(warning, undefined);
      });

      it('should warn about allDay flag with clear operation', () => {
        const result = validateMutationPayload({
          type: MUTATION_TYPES.UPDATE,
          taskId: 'task-123',
          changes: {
            dueDate: {
              operation: 'clear',
              allDay: true
            }
          }
        });
        assert.strictEqual(result.valid, true);
        const warning = result.warnings.find(w => w.code === 'CONFLICTING_DATE_FLAGS');
        assert.notStrictEqual(warning, undefined);
      });
    });
  });

  describe('resolveDateOperation', () => {
    const testTimezone = 'UTC';
    const testNow = new Date('2025-03-31T12:00:00Z');

    describe('Clear Operation', () => {
      it('should return null for clear operation', () => {
        const result = resolveDateOperation('clear', undefined, testTimezone);
        assert.strictEqual(result.isoDate, null);
        assert.strictEqual(result.operation, 'clear');
      });

      it('should ignore value for clear operation', () => {
        const result = resolveDateOperation('clear', 'ignored', testTimezone);
        assert.strictEqual(result.isoDate, null);
      });
    });

    describe('Set Absolute Operation', () => {
      it('should parse ISO 8601 date string', () => {
        const result = resolveDateOperation('set_absolute', '2025-04-15T10:00:00Z', testTimezone);
        assert.strictEqual(result.isoDate, '2025-04-15T10:00:00.000Z');
        assert.strictEqual(result.isAllDay, false);
      });

      it('should parse "today"', () => {
        const result = resolveDateOperation('set_absolute', 'today', testTimezone, { now: testNow });
        assert.strictEqual(result.isAllDay, false);
      });

      it('should parse "tomorrow"', () => {
        const result = resolveDateOperation('set_absolute', 'tomorrow', testTimezone, { now: testNow });
        const expectedDate = new Date('2025-04-01T00:00:00Z');
        assert.strictEqual(result.resolvedTimestamp, expectedDate.getTime());
      });

      it('should parse "next Friday"', () => {
        const result = resolveDateOperation('set_absolute', 'next Friday', testTimezone, { now: testNow });
        assert.ok(result.resolvedTimestamp > testNow.getTime());
      });

      it('should parse "end of month"', () => {
        const result = resolveDateOperation('set_absolute', 'end of month', testTimezone, { now: testNow });
        const expectedEndOfMonth = new Date('2025-03-31T23:59:59.999Z');
        assert.ok(result.resolvedTimestamp >= expectedEndOfMonth.getTime());
      });

      it('should parse "+3 days"', () => {
        const result = resolveDateOperation('set_absolute', '+3 days', testTimezone, { now: testNow });
        const expectedDate = new Date('2025-04-03T00:00:00Z');
        assert.strictEqual(result.resolvedTimestamp, expectedDate.getTime());
      });

      it('should parse "in 2 weeks"', () => {
        const result = resolveDateOperation('set_absolute', 'in 2 weeks', testTimezone, { now: testNow });
        const expectedDate = new Date('2025-04-14T00:00:00Z');
        assert.strictEqual(result.resolvedTimestamp, expectedDate.getTime());
      });

      it('should handle allDay flag', () => {
        const result = resolveDateOperation('set_absolute', '2025-04-15', testTimezone, { allDay: true });
        assert.strictEqual(result.isAllDay, true);
        assert.strictEqual(result.isoDate, '2025-04-15');
      });

      it('should reject past dates', () => {
        assert.throws(() => {
          resolveDateOperation('set_absolute', '2025-03-01T10:00:00Z', testTimezone, { 
            now: testNow,
            allowPast: false
          });
        }, DateError);
      });

      it('should allow past dates with allowPast flag', () => {
        const result = resolveDateOperation('set_absolute', '2025-03-01T10:00:00Z', testTimezone, {
          now: testNow,
          allowPast: true
        });
        assert.strictEqual(result.isoDate, '2025-03-01T10:00:00.000Z');
      });

      it('should reject invalid timezone', () => {
        assert.throws(() => {
          resolveDateOperation('set_absolute', '2025-04-15', 'Invalid/Timezone');
        }, DateError);
      });

      it('should reject invalid date value', () => {
        assert.throws(() => {
          resolveDateOperation('set_absolute', 'not a date', testTimezone);
        }, DateError);
      });

      it('should reject missing value', () => {
        assert.throws(() => {
          resolveDateOperation('set_absolute', undefined, testTimezone);
        }, DateError);
      });

      it('should warn about near-future dates', () => {
        const now = new Date('2025-03-31T12:00:00Z');
        const result = resolveDateOperation('set_absolute', '2025-03-31T12:30:00Z', testTimezone, { now });
        assert.notStrictEqual(result.warning, null);
      });
    });

    describe('Set Relative Operation', () => {
      it('should parse "tomorrow"', () => {
        const result = resolveDateOperation('set_relative', 'tomorrow', testTimezone, { now: testNow });
        const expectedDate = new Date('2025-04-01T00:00:00Z');
        assert.strictEqual(result.resolvedTimestamp, expectedDate.getTime());
      });

      it('should parse "+5 days"', () => {
        const result = resolveDateOperation('set_relative', '+5 days', testTimezone, { now: testNow });
        const expectedDate = new Date('2025-04-05T00:00:00Z');
        assert.strictEqual(result.resolvedTimestamp, expectedDate.getTime());
      });

      it('should parse "-1 week"', () => {
        const result = resolveDateOperation('set_relative', '-1 week', testTimezone, { 
          now: testNow,
          allowPast: true
        });
        const expectedDate = new Date('2025-03-24T00:00:00Z');
        assert.strictEqual(result.resolvedTimestamp, expectedDate.getTime());
      });

      it('should parse "next Monday"', () => {
        const result = resolveDateOperation('set_relative', 'next Monday', testTimezone, { now: testNow });
        // March 31, 2025 is Monday, so next Monday is April 7
        const expectedDate = new Date('2025-04-07T00:00:00Z');
        assert.strictEqual(result.resolvedTimestamp, expectedDate.getTime());
      });

      it('should reject invalid operation', () => {
        assert.throws(() => {
          resolveDateOperation('invalid', 'tomorrow', testTimezone);
        }, DateError);
      });
    });
  });

  describe('mergeChanges', () => {
    const existingTask = {
      id: 'task-123',
      title: 'Original Title',
      content: 'Original content',
      priority: 2,
      tags: ['work', 'meeting'],
      dueDate: '2025-04-15T10:00:00Z',
      completed: false
    };

    describe('Basic Merging', () => {
      it('should merge title change', () => {
        const result = mergeChanges(existingTask, { title: 'New Title' });
        assert.strictEqual(result.merged.title, 'New Title');
        assert.strictEqual(result.merged.content, existingTask.content);
        assert.strictEqual(result.diff.modified[0], 'title');
      });

      it('should merge multiple field changes', () => {
        const result = mergeChanges(existingTask, {
          title: 'New Title',
          priority: 4
        });
        assert.strictEqual(result.merged.title, 'New Title');
        assert.strictEqual(result.merged.priority, 4);
        assert.strictEqual(result.diff.modified.length, 2);
      });

      it('should preserve fields not in changes', () => {
        const result = mergeChanges(existingTask, { title: 'New Title' });
        assert.strictEqual(result.merged.content, existingTask.content);
        assert.strictEqual(result.merged.priority, existingTask.priority);
        assert.strictEqual(result.merged.tags, existingTask.tags);
      });

      it('should skip undefined values', () => {
        const result = mergeChanges(existingTask, {
          title: 'New Title',
          content: undefined
        });
        assert.strictEqual(result.merged.content, existingTask.content);
        assert.notStrictEqual(result.diff.modified.includes('content'), true);
      });
    });

    describe('Explicit Null Handling', () => {
      it('should clear field with explicit null', () => {
        const result = mergeChanges(existingTask, { content: null });
        assert.strictEqual(result.merged.content, undefined);
        assert.strictEqual(result.diff.removed[0], 'content');
      });

      it('should handle null on non-existent field', () => {
        const result = mergeChanges(existingTask, { nonExistent: null });
        assert.strictEqual(result.merged.nonExistent, undefined);
        assert.strictEqual(result.diff.removed.length, 0);
      });
    });

    describe('mergeContent Flag', () => {
      it('should append content with mergeContent=true', () => {
        const result = mergeChanges(existingTask, {
          content: 'Additional notes'
        }, { mergeContent: true });
        assert.strictEqual(result.merged.content, 'Original content\n\nAdditional notes');
        assert.strictEqual(result.diff.modified[0], 'content');
      });

      it('should replace content with mergeContent=false', () => {
        const result = mergeChanges(existingTask, {
          content: 'New content'
        }, { mergeContent: false });
        assert.strictEqual(result.merged.content, 'New content');
      });

      it('should handle append when existing content is empty', () => {
        const taskWithEmptyContent = { ...existingTask, content: '' };
        const result = mergeChanges(taskWithEmptyContent, {
          content: 'New content'
        }, { mergeContent: true });
        assert.strictEqual(result.merged.content, 'New content');
      });

      it('should handle append when new content is empty', () => {
        const result = mergeChanges(existingTask, {
          content: ''
        }, { mergeContent: true });
        assert.strictEqual(result.merged.content, existingTask.content);
      });
    });

    describe('preserveTags Flag', () => {
      it('should append tags with preserveTags=true', () => {
        const result = mergeChanges(existingTask, {
          tags: ['urgent', 'follow-up']
        }, { preserveTags: true });
        assert.deepStrictEqual(result.merged.tags, ['work', 'meeting', 'urgent', 'follow-up']);
      });

      it('should avoid duplicate tags with preserveTags=true', () => {
        const result = mergeChanges(existingTask, {
          tags: ['work', 'new-tag']
        }, { preserveTags: true });
        assert.deepStrictEqual(result.merged.tags, ['work', 'meeting', 'new-tag']);
      });

      it('should replace tags with preserveTags=false', () => {
        const result = mergeChanges(existingTask, {
          tags: ['new-tag']
        }, { preserveTags: false });
        assert.deepStrictEqual(result.merged.tags, ['new-tag']);
      });
    });

    describe('Deep Merge for Nested Objects', () => {
      it('should deep merge nested objects', () => {
        const existingWithDueDate = {
          ...existingTask,
          dueDate: {
            isoDate: '2025-04-15T10:00:00Z',
            isAllDay: false,
            timezone: 'UTC'
          }
        };
        const result = mergeChanges(existingWithDueDate, {
          dueDate: {
            isAllDay: true
          }
        });
        assert.strictEqual(result.merged.dueDate.isoDate, '2025-04-15T10:00:00Z');
        assert.strictEqual(result.merged.dueDate.isAllDay, true);
        assert.strictEqual(result.merged.dueDate.timezone, 'UTC');
      });
    });

    describe('Diff Tracking', () => {
      it('should track added fields', () => {
        const result = mergeChanges(existingTask, { newField: 'value' });
        assert.strictEqual(result.diff.added[0], 'newField');
      });

      it('should track modified fields', () => {
        const result = mergeChanges(existingTask, { title: 'New Title' });
        assert.strictEqual(result.diff.modified[0], 'title');
      });

      it('should track removed fields', () => {
        const result = mergeChanges(existingTask, { content: null });
        assert.strictEqual(result.diff.removed[0], 'content');
      });

      it('should track nested field changes', () => {
        const existingWithDueDate = {
          ...existingTask,
          dueDate: {
            isoDate: '2025-04-15T10:00:00Z',
            isAllDay: false
          }
        };
        const result = mergeChanges(existingWithDueDate, {
          dueDate: { isAllDay: true }
        });
        assert.strictEqual(result.diff.modified[0], 'dueDate.isAllDay');
      });
    });

    describe('Conflict Detection', () => {
      it('should detect clearing due date', () => {
        const result = mergeChanges(existingTask, {
          dueDate: { operation: 'clear' }
        });
        const conflict = result.conflicts.find(c => c.field === 'dueDate');
        assert.notStrictEqual(conflict, undefined);
        assert.strictEqual(conflict.type, 'destructive');
      });

      it('should detect high priority without due date', () => {
        const taskWithoutDueDate = { ...existingTask, dueDate: null };
        const result = mergeChanges(taskWithoutDueDate, { priority: 5 });
        const conflict = result.conflicts.find(c => c.field === 'priority');
        assert.notStrictEqual(conflict, undefined);
        assert.strictEqual(conflict.type, 'recommendation');
      });

      it('should detect significant content reduction', () => {
        const taskWithLongContent = {
          ...existingTask,
          content: 'a'.repeat(500)
        };
        const result = mergeChanges(taskWithLongContent, {
          content: 'short'
        });
        const conflict = result.conflicts.find(c => c.field === 'content');
        assert.notStrictEqual(conflict, undefined);
        assert.strictEqual(conflict.type, 'destructive');
      });

      it('should detect multiple tag removals', () => {
        const result = mergeChanges(existingTask, {
          tags: ['new']
        });
        const conflict = result.conflicts.find(c => c.field === 'tags');
        assert.notStrictEqual(conflict, undefined);
      });

      it('should detect title change on completed task', () => {
        const completedTask = { ...existingTask, completed: true };
        const result = mergeChanges(completedTask, { title: 'New Title' });
        const conflict = result.conflicts.find(c => c.field === 'title');
        assert.notStrictEqual(conflict, undefined);
        assert.strictEqual(conflict.type, 'unusual');
      });
    });

    describe('Strict Mode', () => {
      it('should throw on conflicts in strict mode', () => {
        assert.throws(() => {
          mergeChanges(existingTask, {
            dueDate: { operation: 'clear' }
          }, { strict: true });
        }, MergeConflictError);
      });

      it('should not throw on conflicts in non-strict mode', () => {
        const result = mergeChanges(existingTask, {
          dueDate: { operation: 'clear' }
        }, { strict: false });
        assert.ok(result.merged);
        assert.strictEqual(result.conflicts.length, 1);
      });
    });

    describe('Rollback Functionality', () => {
      it('should create rollback snapshot', () => {
        const snapshot = createRollbackSnapshot(existingTask, {
          added: ['newField'],
          modified: ['title'],
          removed: []
        });
        assert.ok(snapshot.timestamp);
        assert.deepStrictEqual(snapshot.originalState, existingTask);
        assert.strictEqual(snapshot.canRollback, true);
      });

      it('should apply rollback to restore original state', () => {
        const merged = mergeChanges(existingTask, { title: 'New Title' });
        const snapshot = createRollbackSnapshot(existingTask, merged.diff);
        const restored = applyRollback(merged.merged, snapshot);
        assert.deepStrictEqual(restored, existingTask);
      });

      it('should reject invalid rollback snapshot', () => {
        assert.throws(() => {
          applyRollback(existingTask, null);
        }, Error);
      });
    });

    describe('Diff Summary Generation', () => {
      it('should generate summary for added fields', () => {
        const diff = { added: ['newField'], modified: [], removed: [] };
        const summary = generateDiffSummary(diff, {}, { newField: 'value' });
        assert.ok(summary.includes('Added'));
        assert.ok(summary.includes('newField'));
      });

      it('should generate summary for modified fields', () => {
        const diff = { added: [], modified: ['title'], removed: [] };
        const existing = { title: 'Old' };
        const merged = { title: 'New' };
        const summary = generateDiffSummary(diff, existing, merged);
        assert.ok(summary.includes('Modified'));
        assert.ok(summary.includes('title'));
      });

      it('should generate summary for removed fields', () => {
        const diff = { added: [], modified: [], removed: ['content'] };
        const summary = generateDiffSummary(diff, existingTask, {});
        assert.ok(summary.includes('Removed'));
        assert.ok(summary.includes('content'));
      });

      it('should return "No changes" for empty diff', () => {
        const diff = { added: [], modified: [], removed: [] };
        const summary = generateDiffSummary(diff, {}, {});
        assert.strictEqual(summary, 'No changes');
      });
    });

    describe('Merge Result Validation', () => {
      it('should validate merged result', () => {
        const result = mergeChanges(existingTask, { title: 'New Title' });
        const validation = validateMergeResult(result.merged);
        assert.strictEqual(validation.valid, true);
      });

      it('should detect missing ID', () => {
        const validation = validateMergeResult({ title: 'Test' });
        assert.strictEqual(validation.valid, false);
        const error = validation.errors.find(e => e.code === 'MISSING_ID');
        assert.notStrictEqual(error, undefined);
      });

      it('should detect title too long', () => {
        const validation = validateMergeResult({
          id: 'task-123',
          title: 'a'.repeat(1001)
        });
        assert.strictEqual(validation.valid, false);
        const error = validation.errors.find(e => e.code === 'TITLE_TOO_LONG');
        assert.notStrictEqual(error, undefined);
      });

      it('should detect priority out of range', () => {
        const validation = validateMergeResult({
          id: 'task-123',
          priority: 10
        });
        assert.strictEqual(validation.valid, false);
        const error = validation.errors.find(e => e.code === 'PRIORITY_OUT_OF_RANGE');
        assert.notStrictEqual(error, undefined);
      });

      it('should detect too many tags', () => {
        const validation = validateMergeResult({
          id: 'task-123',
          tags: new Array(101).fill('tag')
        });
        assert.strictEqual(validation.valid, false);
        const error = validation.errors.find(e => e.code === 'TOO_MANY_TAGS');
        assert.notStrictEqual(error, undefined);
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty existing object', () => {
        const result = mergeChanges({}, { title: 'New Title' });
        assert.strictEqual(result.merged.title, 'New Title');
        assert.strictEqual(result.diff.added[0], 'title');
      });

      it('should handle empty changes object', () => {
        const result = mergeChanges(existingTask, {});
        assert.deepStrictEqual(result.merged, existingTask);
        assert.strictEqual(result.diff.added.length, 0);
        assert.strictEqual(result.diff.modified.length, 0);
        assert.strictEqual(result.diff.removed.length, 0);
      });

      it('should deep clone arrays', () => {
        const result = mergeChanges(existingTask, { tags: ['new'] });
        result.merged.tags.push('another');
        assert.strictEqual(existingTask.tags.length, 2);
        assert.strictEqual(result.merged.tags.length, 2);
      });

      it('should deep clone nested objects', () => {
        const existingWithNested = {
          ...existingTask,
          dueDate: { isoDate: '2025-04-15', isAllDay: false }
        };
        const result = mergeChanges(existingWithNested, {
          dueDate: { isAllDay: true }
        });
        result.merged.dueDate.isoDate = 'modified';
        assert.strictEqual(existingWithNested.dueDate.isoDate, '2025-04-15');
      });

      it('should handle unicode in content', () => {
        const result = mergeChanges(existingTask, {
          content: 'Hello 世界 🌍'
        });
        assert.strictEqual(result.merged.content, 'Hello 世界 🌍');
      });

      it('should handle very long content', () => {
        const longContent = 'a'.repeat(5000);
        const result = mergeChanges(existingTask, { content: longContent });
        assert.strictEqual(result.merged.content.length, 5000);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete UPDATE mutation flow', () => {
      const payload = {
        type: MUTATION_TYPES.UPDATE,
        taskId: 'task-123',
        changes: {
          title: 'Updated Task',
          priority: 3,
          dueDate: {
            operation: 'set_absolute',
            value: '2025-04-20T14:00:00Z'
          }
        },
        mergeContent: false
      };

      // Validate
      const validation = validateMutationPayload(payload);
      assert.strictEqual(validation.valid, true);

      // Resolve date
      const dateResult = resolveDateOperation(
        payload.changes.dueDate.operation,
        payload.changes.dueDate.value,
        'UTC'
      );
      assert.ok(dateResult.isoDate);

      // Merge with existing
      const existingTask = {
        id: 'task-123',
        title: 'Original Task',
        priority: 1,
        content: 'Some content'
      };
      const mergeResult = mergeChanges(existingTask, payload.changes);
      assert.strictEqual(mergeResult.merged.title, 'Updated Task');
      assert.strictEqual(mergeResult.merged.priority, 3);
    });

    it('should handle COMPLETE mutation', () => {
      const payload = {
        type: MUTATION_TYPES.COMPLETE,
        taskId: 'task-456'
      };

      const validation = validateMutationPayload(payload);
      assert.strictEqual(validation.valid, true);
    });

    it('should handle DELETE mutation', () => {
      const payload = {
        type: MUTATION_TYPES.DELETE,
        taskId: 'task-789'
      };

      const validation = validateMutationPayload(payload);
      assert.strictEqual(validation.valid, true);
    });

    it('should handle RESCHEDULE mutation', () => {
      const payload = {
        type: MUTATION_TYPES.RESCHEDULE,
        taskId: 'task-123',
        changes: {
          dueDate: {
            operation: 'set_relative',
            value: 'tomorrow'
          }
        }
      };

      const validation = validateMutationPayload(payload);
      assert.strictEqual(validation.valid, true);
    });

    it('should reject invalid mutation end-to-end', () => {
      const payload = {
        type: 'INVALID',
        taskId: '',
        changes: {
          priority: 10
        }
      };

      const validation = validateMutationPayload(payload);
      assert.strictEqual(validation.valid, false);
      assert.ok(validation.errors.length >= 3); // type, taskId, priority
    });
  });

  describe('Error Class Tests', () => {
    it('should create ValidationError with correct properties', () => {
      const error = new ValidationError(
        VALIDATION_ERRORS.INVALID_TYPE,
        'title',
        123
      );
      assert.strictEqual(error.name, 'ValidationError');
      assert.strictEqual(error.code, VALIDATION_ERRORS.INVALID_TYPE);
      assert.strictEqual(error.field, 'title');
      assert.strictEqual(error.value, 123);
      assert.ok(error.timestamp);
    });

    it('should create DateError with correct properties', () => {
      const error = new DateError(
        VALIDATION_ERRORS.INVALID_DATE_VALUE,
        'set_absolute',
        'not-a-date'
      );
      assert.strictEqual(error.name, 'DateError');
      assert.strictEqual(error.operation, 'set_absolute');
      assert.strictEqual(error.value, 'not-a-date');
    });

    it('should create MergeConflictError with correct properties', () => {
      const error = new MergeConflictError(
        VALIDATION_ERRORS.CONFLICTING_OPERATIONS,
        ['dueDate', 'priority']
      );
      assert.strictEqual(error.name, 'MergeConflictError');
      assert.deepStrictEqual(error.conflictingFields, ['dueDate', 'priority']);
    });

    it('should serialize error to JSON', () => {
      const error = new ValidationError(
        VALIDATION_ERRORS.INVALID_TYPE,
        'field',
        'value'
      );
      const json = error.toJSON();
      assert.strictEqual(json.name, 'ValidationError');
      assert.strictEqual(json.code, VALIDATION_ERRORS.INVALID_TYPE);
      assert.ok(json.timestamp);
    });
  });
});
```
