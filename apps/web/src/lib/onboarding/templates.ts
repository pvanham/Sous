import type { BusinessType, DayOfWeek, OperatingHoursDTO } from "@sous/types";

export type ShiftSlotTemplate = {
  name?: string;
  station?: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  minStaff: number;
  preferredStaff: number;
  priority: "critical" | "high" | "normal" | "low";
};

export type BusinessTypeTemplate = {
  roles: string[];
  managerRoles: string[];
  stations: string[];
  operatingHours: Record<DayOfWeek, OperatingHoursDTO>;
  shiftSlots: ShiftSlotTemplate[];
};

const weekdays = [1, 2, 3, 4, 5];
const everyDay = [0, 1, 2, 3, 4, 5, 6];

function standardOperatingHours(open: string, close: string): Record<DayOfWeek, OperatingHoursDTO> {
  return {
    monday: { isOpen: true, open, close },
    tuesday: { isOpen: true, open, close },
    wednesday: { isOpen: true, open, close },
    thursday: { isOpen: true, open, close },
    friday: { isOpen: true, open, close },
    saturday: { isOpen: true, open, close },
    sunday: { isOpen: true, open, close },
  };
}

export const KITCHEN_TEMPLATES: Record<BusinessType, BusinessTypeTemplate> = {
  qsr: {
    roles: ["General Manager", "Shift Lead", "Crew Member", "Cashier"],
    managerRoles: ["General Manager", "Shift Lead"],
    stations: ["Grill", "Fryer", "Assembly", "Drive Thru"],
    operatingHours: standardOperatingHours("07:00", "22:00"),
    shiftSlots: [
      {
        name: "Morning",
        startTime: "07:00",
        endTime: "15:00",
        daysOfWeek: everyDay,
        minStaff: 2,
        preferredStaff: 3,
        priority: "high",
      },
      {
        name: "Swing",
        startTime: "11:00",
        endTime: "19:00",
        daysOfWeek: everyDay,
        minStaff: 2,
        preferredStaff: 3,
        priority: "normal",
      },
      {
        name: "Night",
        startTime: "15:00",
        endTime: "22:00",
        daysOfWeek: everyDay,
        minStaff: 2,
        preferredStaff: 3,
        priority: "high",
      },
    ],
  },
  fast_casual: {
    roles: ["General Manager", "Shift Lead", "Line Cook", "Cashier", "Prep Cook"],
    managerRoles: ["General Manager", "Shift Lead"],
    stations: ["Hot Line", "Cold Line", "Prep", "Expo"],
    operatingHours: standardOperatingHours("09:00", "21:00"),
    shiftSlots: [
      {
        name: "Morning",
        startTime: "09:00",
        endTime: "16:00",
        daysOfWeek: everyDay,
        minStaff: 2,
        preferredStaff: 3,
        priority: "normal",
      },
      {
        name: "Night",
        startTime: "15:00",
        endTime: "22:00",
        daysOfWeek: everyDay,
        minStaff: 2,
        preferredStaff: 3,
        priority: "high",
      },
    ],
  },
  fine_dining: {
    roles: [
      "General Manager",
      "Sous Chef",
      "Line Cook",
      "Prep Cook",
      "Server",
      "Bartender",
    ],
    managerRoles: ["General Manager", "Sous Chef"],
    stations: ["Saute", "Grill", "Garde Manger", "Pastry", "Expo", "Bar"],
    operatingHours: standardOperatingHours("11:00", "23:00"),
    shiftSlots: [
      {
        name: "Prep",
        startTime: "10:00",
        endTime: "16:00",
        daysOfWeek: everyDay,
        minStaff: 1,
        preferredStaff: 2,
        priority: "normal",
      },
      {
        name: "Dinner",
        startTime: "16:00",
        endTime: "23:00",
        daysOfWeek: everyDay,
        minStaff: 3,
        preferredStaff: 4,
        priority: "critical",
      },
    ],
  },
  catering: {
    roles: ["General Manager", "Chef", "Prep Cook", "Driver", "Coordinator"],
    managerRoles: ["General Manager", "Coordinator"],
    stations: ["Prep", "Packaging", "Dispatch"],
    operatingHours: standardOperatingHours("08:00", "20:00"),
    shiftSlots: [
      {
        name: "Prep",
        startTime: "08:00",
        endTime: "15:00",
        daysOfWeek: weekdays,
        minStaff: 2,
        preferredStaff: 3,
        priority: "high",
      },
      {
        name: "Delivery",
        startTime: "12:00",
        endTime: "20:00",
        daysOfWeek: weekdays,
        minStaff: 1,
        preferredStaff: 2,
        priority: "normal",
      },
    ],
  },
  bar: {
    roles: ["General Manager", "Bar Lead", "Bartender", "Barback", "Server"],
    managerRoles: ["General Manager", "Bar Lead"],
    stations: ["Bar", "Service Well", "Floor"],
    operatingHours: standardOperatingHours("14:00", "02:00"),
    shiftSlots: [
      {
        name: "Open",
        startTime: "14:00",
        endTime: "20:00",
        daysOfWeek: everyDay,
        minStaff: 2,
        preferredStaff: 3,
        priority: "normal",
      },
      {
        name: "Close",
        startTime: "19:00",
        endTime: "02:00",
        daysOfWeek: everyDay,
        minStaff: 2,
        preferredStaff: 4,
        priority: "critical",
      },
    ],
  },
  cafe: {
    roles: ["General Manager", "Shift Lead", "Barista", "Prep Cook", "Cashier"],
    managerRoles: ["General Manager", "Shift Lead"],
    stations: ["Espresso", "Bakery", "Sandwich", "Register"],
    operatingHours: standardOperatingHours("06:00", "18:00"),
    shiftSlots: [
      {
        name: "Morning",
        startTime: "06:00",
        endTime: "13:00",
        daysOfWeek: everyDay,
        minStaff: 2,
        preferredStaff: 3,
        priority: "high",
      },
      {
        name: "Afternoon",
        startTime: "12:00",
        endTime: "18:00",
        daysOfWeek: everyDay,
        minStaff: 2,
        preferredStaff: 3,
        priority: "normal",
      },
    ],
  },
  other: {
    roles: ["General Manager", "Shift Lead", "Team Member"],
    managerRoles: ["General Manager", "Shift Lead"],
    stations: ["Main Station"],
    operatingHours: standardOperatingHours("09:00", "21:00"),
    shiftSlots: [
      {
        name: "Day",
        startTime: "09:00",
        endTime: "17:00",
        daysOfWeek: everyDay,
        minStaff: 1,
        preferredStaff: 2,
        priority: "normal",
      },
      {
        name: "Evening",
        startTime: "14:00",
        endTime: "21:00",
        daysOfWeek: everyDay,
        minStaff: 1,
        preferredStaff: 2,
        priority: "normal",
      },
    ],
  },
};
