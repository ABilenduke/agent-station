export type Status = "Ready" | "In progress" | "At risk";
export interface Job {
  id: string;
  customer: string;
  destination: string;
  owner: string;
  parcels: number;
  due: string;
  status: Status;
  note: string;
}

export const jobs: Job[] = [
  {
    id: "HB-1042",
    customer: "Cedar & Co.",
    destination: "West End",
    owner: "M. Chen",
    parcels: 8,
    due: "14:00",
    status: "At risk",
    note: "Address confirmation needed before loading. Call the customer using the dispatch directory.",
  },
  {
    id: "HB-1043",
    customer: "Common Ground",
    destination: "Old Town",
    owner: "A. Rivera",
    parcels: 3,
    due: "14:15",
    status: "Ready",
    note: "Leave with the reception desk. Delivery entrance is on Birch Street.",
  },
  {
    id: "HB-1044",
    customer: "Northline Books",
    destination: "Riverside",
    owner: "S. Patel",
    parcels: 12,
    due: "14:20",
    status: "In progress",
    note: "Packing the final two cartons. Keep boxes dry during transfer.",
  },
  {
    id: "HB-1045",
    customer: "Juniper Supply",
    destination: "North Quarter",
    owner: "M. Chen",
    parcels: 6,
    due: "14:30",
    status: "Ready",
    note: "Use the loading bay behind Unit 4. The handoff contact is at the bay.",
  },
  {
    id: "HB-1046",
    customer: "Little Atlas",
    destination: "Old Town",
    owner: "J. Okafor",
    parcels: 4,
    due: "14:30",
    status: "At risk",
    note: "One parcel is missing its label. Print a replacement before handoff.",
  },
  {
    id: "HB-1047",
    customer: "Bramble Studio",
    destination: "West End",
    owner: "A. Rivera",
    parcels: 2,
    due: "14:45",
    status: "In progress",
    note: "Fragile ceramics. Keep upright and do not stack.",
  },
  {
    id: "HB-1048",
    customer: "The Paper Room",
    destination: "Market District",
    owner: "S. Patel",
    parcels: 5,
    due: "15:00",
    status: "Ready",
    note: "Receiving desk closes at 16:00. Ring the side-door bell on arrival.",
  },
  {
    id: "HB-1049",
    customer: "Eastbank Coffee",
    destination: "Riverside",
    owner: "J. Okafor",
    parcels: 9,
    due: "15:00",
    status: "In progress",
    note: "Combine with the Riverside route. Keep food items separate from cleaning supplies.",
  },
  {
    id: "HB-1050",
    customer: "Moss Hardware",
    destination: "North Quarter",
    owner: "M. Chen",
    parcels: 7,
    due: "15:15",
    status: "Ready",
    note: "Two-person lift for the long carton. Trolley available at dispatch.",
  },
  {
    id: "HB-1051",
    customer: "Neighbourhood Pantry",
    destination: "Market District",
    owner: "A. Rivera",
    parcels: 10,
    due: "15:30",
    status: "At risk",
    note: "Driver reassignment pending. Confirm a driver before moving to the loading zone.",
  },
  {
    id: "HB-1052",
    customer: "Willow House",
    destination: "West End",
    owner: "S. Patel",
    parcels: 3,
    due: "15:45",
    status: "Ready",
    note: "Deliver to the ground-floor reception. Do not leave outside.",
  },
  {
    id: "HB-1053",
    customer: "South Yard Works",
    destination: "South Yard",
    owner: "J. Okafor",
    parcels: 11,
    due: "16:00",
    status: "In progress",
    note: "Security requires the job ID at the gate. Use the south entrance.",
  },
];
