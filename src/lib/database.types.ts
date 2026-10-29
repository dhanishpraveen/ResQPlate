export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type UserProfile = {
  id: string;
  role: "donor" | "ngo" | "volunteer" | null;
  full_name: string | null;
  phone_number: string | null;
  address: string | null;
  about: string | null;
  avatar_path: string | null;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
};

type DonorProfile = {
  id: string;
  business_name: string | null;
  cuisine_type: string | null;
  business_address: string | null;
  operating_hours: Json | null;
  food_capacity_per_day: number | null;
  terms_accepted_at: string | null;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
};

type NgoProfile = {
  id: string;
  organization_name: string | null;
  organization_address: string | null;
  registration_number: string | null;
  organization_type: string | null;
  description: string | null;
  contact_name: string | null;
  contact_designation: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  registration_certificate_path: string | null;
  ngo_proof_path: string | null;
  organization_latitude: number | null;
  organization_longitude: number | null;
  verification_status: "pending" | "verified" | "rejected";
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
};

type VolunteerProfile = {
  id: string;
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
};

type DonationStatus = "draft" | "available" | "claimed" | "picked_up" | "completed" | "cancelled";
type RequestStatus = "pending" | "confirmed" | "declined" | "picked_up" | "completed" | "cancelled";
type DeliveryVerificationStatus = "pending" | "verified" | "issue_reported";

type Donation = {
  id: string;
  donor_id: string;
  food_name: string;
  cuisine_type: string;
  description: string;
  quantity: number;
  unit: "servings" | "portions" | "kg" | "items";
  expires_at: string;
  pickup_address: string;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  pickup_instructions: string | null;
  photo_path: string | null;
  status: DonationStatus;
  created_at: string;
  updated_at: string;
};

type PickupRequest = {
  id: string;
  donation_id: string;
  ngo_id: string;
  requested_quantity: number;
  pickup_at: string | null;
  notes: string | null;
  dropoff_address: string | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  status: RequestStatus;
  received_quantity: number | null;
  receipt_confirmed_at: string | null;
  receipt_confirmed_by: string | null;
  volunteer_id: string | null;
  volunteer_picked_up_at: string | null;
  volunteer_delivered_at: string | null;
  delivery_verification_status: DeliveryVerificationStatus;
  delivery_verified_at: string | null;
  delivery_verified_by: string | null;
  delivery_issue_reason: string | null;
  created_at: string;
  updated_at: string;
};

type VolunteerTask = {
  request_id: string;
  donation_id: string;
  food_name: string;
  description: string;
  quantity: number;
  unit: Donation["unit"];
  pickup_at: string | null;
  expires_at: string;
  status: RequestStatus;
  donor_name: string | null;
  donor_phone: string | null;
  pickup_address: string | null;
  pickup_instructions: string | null;
  ngo_name: string | null;
  ngo_address: string | null;
  ngo_contact_name: string | null;
  ngo_contact_phone: string | null;
  volunteer_picked_up_at: string | null;
  volunteer_delivered_at: string | null;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_address: string | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  volunteer_assigned: boolean;
};

type SurplusForecast = {
  id: string;
  donor_id: string;
  food_category: string;
  restaurant_type: string;
  planned_quantity: number;
  expected_customers: number;
  historical_sales: number | null;
  historical_leftover: number | null;
  meal_period: "breakfast" | "lunch" | "dinner" | "banquet";
  training_data_source: "synthetic_demo_hotel" | "verified_donor_history";
  ready_at: string;
  predicted_quantity: number;
  uncertainty_lower: number;
  uncertainty_upper: number;
  unit: string;
  model_version: string;
  status: "estimated" | "confirmed" | "ready" | "cancelled";
  confirmed_quantity: number | null;
  actual_ready_at: string | null;
  created_at: string;
  updated_at: string;
};

type NgoDemandRequirement = {
  id: string;
  ngo_id: string;
  food_category: string;
  dietary_constraints: string | null;
  required_quantity: number;
  unit: string;
  required_by: string;
  delivery_address: string;
  status: "active" | "fulfilled" | "cancelled" | "expired";
  created_at: string;
  updated_at: string;
};

type MatchRecommendation = {
  id: string;
  demand_id: string;
  forecast_id: string | null;
  donation_id: string | null;
  is_feasible: boolean;
  allocatable_quantity: number;
  score: number;
  explanation: string[];
  created_at: string;
};

type QuantityAllocation = {
  id: string;
  demand_id: string;
  forecast_id: string | null;
  donation_id: string | null;
  quantity: number;
  unit: string;
  status: "reserved" | "released" | "fulfilled";
  idempotency_key: string;
  reserved_at: string;
  released_at: string | null;
  fulfilled_at: string | null;
};

type NotificationEvent = {
  id: string;
  recipient_id: string;
  event_key: string;
  event_type: string;
  payload: Json;
  status: "pending" | "sent" | "failed";
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      user_profiles: Table<
        UserProfile,
        Pick<UserProfile, "id"> & Partial<Omit<UserProfile, "id" | "created_at" | "updated_at">>,
        Partial<Omit<UserProfile, "id" | "created_at" | "updated_at">>
      >;
      donor_profiles: Table<
        DonorProfile,
        Pick<DonorProfile, "id"> & Partial<Omit<DonorProfile, "id" | "created_at" | "updated_at">>,
        Partial<Omit<DonorProfile, "id" | "created_at" | "updated_at">>
      >;
      ngo_profiles: Table<
        NgoProfile,
        Pick<NgoProfile, "id"> & Partial<Omit<NgoProfile, "id" | "created_at" | "updated_at">>,
        Partial<Omit<NgoProfile, "id" | "created_at" | "updated_at" | "verification_status">>
      >;
      volunteer_profiles: Table<
        VolunteerProfile,
        Pick<VolunteerProfile, "id"> & Partial<Omit<VolunteerProfile, "id" | "created_at" | "updated_at">>,
        Partial<Omit<VolunteerProfile, "id" | "created_at" | "updated_at">>
      >;
      donations: Table<
        Donation,
        Pick<Donation, "donor_id" | "food_name" | "cuisine_type" | "description" | "quantity" | "unit" | "expires_at" | "pickup_address"> &
          Partial<Pick<Donation, "pickup_latitude" | "pickup_longitude" | "pickup_instructions" | "photo_path" | "status">>,
        Partial<Pick<Donation, "food_name" | "cuisine_type" | "description" | "quantity" | "unit" | "expires_at" | "pickup_address" | "pickup_latitude" | "pickup_longitude" | "pickup_instructions" | "photo_path" | "status">>
      >;
      pickup_requests: Table<
        PickupRequest,
        Pick<PickupRequest, "donation_id" | "ngo_id" | "requested_quantity"> &
          Partial<Pick<PickupRequest, "pickup_at" | "notes" | "dropoff_address" | "dropoff_latitude" | "dropoff_longitude">>,
        never
      >;
      donation_status_history: Table<
        { id: number; donation_id: string; status: DonationStatus; changed_by: string | null; changed_at: string },
        never,
        never
      >;
      pickup_request_status_history: Table<
        { id: number; pickup_request_id: string; status: RequestStatus; changed_by: string | null; changed_at: string },
        never,
        never
      >;
      donation_handovers: Table<
        { id: string; pickup_request_id: string; quantity_handed_over: number; photo_path: string | null; note: string | null; recorded_by: string; recorded_at: string },
        never,
        never
      >;
      surplus_forecasts: Table<
        SurplusForecast,
        Pick<SurplusForecast, "donor_id" | "food_category" | "restaurant_type" | "meal_period" | "planned_quantity" | "expected_customers" | "ready_at" | "predicted_quantity" | "uncertainty_lower" | "uncertainty_upper" | "unit" | "model_version"> &
          Partial<Pick<SurplusForecast, "historical_sales" | "historical_leftover" | "training_data_source">> &
          Partial<Pick<SurplusForecast, "status" | "confirmed_quantity" | "actual_ready_at">>,
        Partial<Pick<SurplusForecast, "food_category" | "restaurant_type" | "meal_period" | "planned_quantity" | "expected_customers" | "historical_sales" | "historical_leftover" | "training_data_source" | "ready_at" | "status" | "confirmed_quantity" | "actual_ready_at">>
      >;
      ngo_demand_requirements: Table<
        NgoDemandRequirement,
        Pick<NgoDemandRequirement, "ngo_id" | "food_category" | "required_quantity" | "unit" | "required_by" | "delivery_address"> &
          Partial<Pick<NgoDemandRequirement, "dietary_constraints" | "status">>,
        Partial<Pick<NgoDemandRequirement, "food_category" | "dietary_constraints" | "required_quantity" | "unit" | "required_by" | "delivery_address" | "status">>
      >;
      match_recommendations: Table<MatchRecommendation, never, never>;
      quantity_allocations: Table<QuantityAllocation, never, never>;
      notification_events: Table<NotificationEvent, never, never>;
    };
    Views: {
      donor_pickup_request_details: {
        Row: {
          request_id: string;
          donation_id: string;
          requested_quantity: number;
          pickup_at: string | null;
          notes: string | null;
          status: RequestStatus;
          received_quantity: number | null;
          receipt_confirmed_at: string | null;
          created_at: string;
          updated_at: string;
          organization_name: string | null;
          contact_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
        };
        Relationships: [];
      };
      donor_completed_impact: {
        Row: {
          donation_id: string;
          cuisine_type: string;
          unit: Donation["unit"];
          quantity: number;
          completed_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      assign_initial_role: {
        Args: { p_role: "donor" | "ngo" | "volunteer" };
        Returns: undefined;
      };
      review_pickup_request: {
        Args: { p_request_id: string; p_action: "confirm" | "decline" };
        Returns: undefined;
      };
      cancel_donation: {
        Args: { p_donation_id: string };
        Returns: undefined;
      };
      confirm_donor_handover: {
        Args: { p_request_id: string; p_photo_path?: string | null; p_note?: string | null };
        Returns: undefined;
      };
      confirm_ngo_receipt: {
        Args: { p_request_id: string; p_received_quantity: number };
        Returns: undefined;
      };
      report_ngo_delivery_issue: {
        Args: { p_request_id: string; p_reason: string };
        Returns: undefined;
      };
      can_submit_pickup_request: {
        Args: { p_donation_id: string; p_quantity: number };
        Returns: boolean;
      };
      list_available_donations: {
        Args: { p_donation_id?: string | null };
        Returns: Array<Pick<
          Donation,
          "id" | "food_name" | "cuisine_type" | "description" | "quantity" | "unit" | "expires_at" | "status" | "created_at" | "photo_path"
        >>;
      };
      list_volunteer_tasks: {
        Args: Record<PropertyKey, never>;
        Returns: VolunteerTask[];
      };
      claim_volunteer_task: {
        Args: { p_request_id: string };
        Returns: undefined;
      };
      volunteer_confirm_pickup: {
        Args: { p_request_id: string; p_note?: string | null };
        Returns: undefined;
      };
      reserve_donation_quantity: {
        Args: { p_demand_id: string; p_donation_id: string; p_quantity: number; p_idempotency_key: string };
        Returns: string;
      };
      release_quantity_allocation: {
        Args: { p_allocation_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
