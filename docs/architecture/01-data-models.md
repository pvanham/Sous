# Data Models

This document outlines the core data models used within the Sous application. Sous uses MongoDB Atlas with Mongoose schemas.

## Multi-Tenancy Foundation (Phase 1)
All data in Sous is scoped to ensure strict multi-tenancy rules. Use `orgId` and `locationId` on queries to ensure users only see data for their specific location.

```typescript
// Organization - Tenant container
{
  ownerId: string,          // Clerk user ID of owner
  name: string,
  createdAt: Date,
  updatedAt: Date
}

// Location - Kitchen location within an organization
{
  orgId: ObjectId,          // Reference to Organization
  name: string,
  timezone: string,         // IANA timezone (e.g., "America/New_York")
  twilioPhoneNumber?: string, // E.164 format, optional
  createdAt: Date,
  updatedAt: Date
}

// OrganizationMember - User-to-location membership
{
  orgId: ObjectId,          // Reference to Organization
  locationId: ObjectId?,    // Reference to Location (null = org-wide access)
  clerkUserId: string,      // Clerk user ID
  role: 'owner' | 'manager' | 'shift_lead' | 'staff',
  createdAt: Date,
  updatedAt: Date
}
```

## Core Scheduling Models (Phase 1 & 2)

```typescript
// KitchenConfig - Restaurant settings
{
  orgId: ObjectId,          
  locationId: ObjectId,     
  name: string,
  stations: string[],       // e.g., ["Grill", "Prep", "Assembly"]
  roles: string[],          // e.g., ["Manager", "Cook", "Host"]
  operatingHours: {
    monday: { isOpen: boolean, open: string, close: string },
    // ... other days
  }
}

// Staff - Employee records
{
  orgId: ObjectId,          
  locationId: ObjectId,     
  name: string,
  email: string,
  phone: string,
  roles: string[],          
  skills: [{ station: string, proficiency: 1-5 }],
  isActive: boolean,
  
  // App invitation / auth linkage
  clerkUserId?: string,     // Set when staff accepts invitation and creates account
  invitationStatus: 'not_invited' | 'pending' | 'accepted',
  
  // Phase 3 Extensions
  maxHoursPerWeek: number,  
  minHoursPerWeek: number,  
  preferredStations: string[], 
  hourlyRate: number,       // Required for labor cost calculations
  
  // Phase 4 Extensions
  smsConsent: boolean,      // TCPA compliance, default false
  smsConsentDate?: Date,    // When consent was given
}

// Schedule - Week container
{
  orgId: ObjectId,          
  locationId: ObjectId,     
  weekStartDate: Date,      // Always a Monday
  status: 'DRAFT' | 'PUBLISHED',
  notes: string
}

// Shift - Individual work assignment
{
  orgId: ObjectId,          
  locationId: ObjectId,     
  scheduleId: ObjectId,
  staffId: ObjectId,
  start: Date,
  end: Date,
  station: string,
  notes: string
}
```

## Advanced Scheduling Models (Phase 3)
These models support the AI CP-Solver schedule generation.

```typescript
// LaborRequirement - Staffing targets (Demand)
{
  userId: string,
  dayOfWeek: 0-6,
  station: string,
  startTime: string,
  endTime: string,
  minStaff: number,
  preferredStaff: number,
  priority: 'critical' | 'high' | 'normal' | 'low'
}

// StaffAvailability - When staff can work (Supply)
{
  userId: string,
  staffId: ObjectId,
  dayOfWeek: 0-6,
  availableFrom: string,
  availableTo: string,
  preference: 'preferred' | 'available' | 'unavailable'
}

// TimeOffRequest - Specific date-range time-off requests
{
  userId: string,
  staffId: ObjectId,
  startDate: Date,
  endDate: Date,
  reason?: string,
  status: 'pending' | 'approved' | 'denied',
  createdAt: Date,
  reviewedAt?: Date,
  reviewedBy?: string
}
```

## AI Models
```typescript
// AIUsageLog - Tracks token/solver usage for billing/analytics
{
  userId: string,
  action: string, // e.g., 'generate_schedule'
  model: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  durationMs: number,
  success: boolean,
  errorMessage: string,
  createdAt: Date
}
```

## Planned Message Models (Phase 4 - Agentic AI)
These models form the foundation of the Twilio SMS two-way communication system.

```typescript
// Message - SMS records
{
  userId: string,
  staffId: ObjectId,
  from: string,
  to: string,
  body: string,
  direction: 'inbound' | 'outbound',
  status: 'received' | 'processing' | 'handled' | 'escalated',
  intent: 'CALL_OUT' | 'LATE' | 'SHIFT_SWAP' | 'QUESTION' | 'OTHER',
  parsedData: { date, reason, confidence },
  threadId: string
}

// CoverageRequest - Shift coverage tracking
{
  messageId: ObjectId,
  shiftId: ObjectId,
  requestedBy: ObjectId,
  status: 'searching' | 'offered' | 'accepted' | 'declined',
  candidates: [{ staffId, status, offeredAt, respondedAt }],
  acceptedBy: ObjectId
}
```
