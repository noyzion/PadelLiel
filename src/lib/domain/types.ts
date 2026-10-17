/** Row shapes returned by the database (see supabase/migrations). */

export type UserRole = 'admin' | 'trainee';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'inactive';
export type SessionStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
export type BookingStatus =
  | 'CONFIRMED'
  | 'CANCELLED_EARLY'
  | 'CANCELLED_LATE'
  | 'ATTENDED'
  | 'NO_SHOW'
  | 'CANCELLED_BY_COACH';
export type WaitlistStatus = 'WAITING' | 'PROMOTED' | 'LEFT' | 'REMOVED';

export interface SkillLevel {
  code: string;
  label_he: string;
  sort_order: number;
  is_active: boolean;
}

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  email: string | null;
  approval_status: ApprovalStatus;
  skill_level_code: string | null;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  monthly_session_limit: number;
  description: string | null;
  is_active: boolean;
}

export interface MemberSubscription {
  id: string;
  member_id: string;
  plan_id: string;
  is_active: boolean;
  /** Closed because a newer subscription replaced it: still in force for the dates it covers. */
  superseded: boolean;
  starts_on: string;
  ends_on: string | null;
  created_at: string;
  subscription_plans?: Pick<SubscriptionPlan, 'name' | 'monthly_session_limit'> | null;
}

/** Monthly session quota as computed by `get_member_allowance`. The only source for these numbers. */
export interface Allowance {
  /** First day of the calendar month the numbers refer to. */
  month_start: string;
  plan_id: string | null;
  plan_name: string | null;
  plan_limit: number;
  adjustments: number;
  effective_limit: number;
  used: number;
  remaining: number;
  has_active_subscription: boolean;
  /** One free session left (only when there is no plan in force this month). */
  trial_available: boolean;
}

export interface MonthlyUsageRow {
  month_start: string;
  plan_name: string | null;
  effective_limit: number;
  used: number;
  remaining: number;
  late_cancellations: number;
  no_shows: number;
  attended: number;
  adjustments: number;
}

/** A session in a week, as returned by `get_week_schedule`. */
export interface ScheduleSession {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  starts_at: string;
  ends_at: string;
  week_start: string;
  skill_level_code: string;
  capacity: number;
  status: SessionStatus;
  registration_open: boolean;
  notes: string | null;
  occupied_count: number;
  waitlist_count: number;
  my_booking_id: string | null;
  my_booking_status: BookingStatus | null;
  my_waitlist_entry_id: string | null;
  my_waitlist_position: number | null;
  /** First rule that blocks the caller from booking (an error code) or null if she can book. */
  block_reason: string | null;
  cancellation_deadline: string;
  /** True when "now" is already inside the cancellation cutoff window (last-minute). */
  is_late_window: boolean;
  /** The caller's occupying booking on this session is the one-time free trial. */
  my_booking_is_trial: boolean;
}

/** A booking in `get_my_bookings`. */
export interface MyBooking {
  booking_id: string;
  session_id: string;
  status: BookingStatus;
  booked_at: string;
  cancelled_at: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  starts_at: string;
  ends_at: string;
  week_start: string;
  session_status: SessionStatus;
  skill_level_code: string;
  cancellation_deadline: string;
  is_late_window: boolean;
  can_cancel: boolean;
  counts_toward_allowance: boolean;
  is_trial: boolean;
}

export interface CancelResult {
  booking_id: string;
  status: 'CANCELLED_EARLY' | 'CANCELLED_LATE';
  allowance_restored: boolean;
  cancellation_deadline: string;
}

/** A row of `admin_list_members`. */
export interface MemberOverview {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  approval_status: ApprovalStatus;
  skill_level_code: string | null;
  admin_notes: string | null;
  created_at: string;
  subscription_id: string | null;
  subscription_active: boolean | null;
  subscription_starts_on: string | null;
  subscription_ends_on: string | null;
  plan_name: string | null;
  monthly_limit: number;
  adjustments: number;
  used: number;
  remaining: number;
  has_active_subscription: boolean;
}

export interface SessionRow {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  starts_at: string;
  ends_at: string;
  week_start: string;
  skill_level_code: string;
  capacity: number;
  status: SessionStatus;
  registration_open: boolean;
  notes: string | null;
  cancel_reason: string | null;
}

export interface AppSettings {
  cancellation_cutoff_hours: number;
  default_capacity: number;
  default_time_slots: { start: string; end: string }[];
}

export type NotificationType =
  | 'booking_confirmed'
  | 'training_reminder'
  | 'cancellation_deadline'
  | 'session_cancelled'
  | 'schedule_published';

/** A row of the trainee's in-app notification center. */
export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  destination_url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  push_enabled: boolean;
  training_reminders: boolean;
  cancellation_deadline_reminders: boolean;
  booking_updates: boolean;
  weekly_schedule: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push_enabled: true,
  training_reminders: true,
  cancellation_deadline_reminders: true,
  booking_updates: true,
  weekly_schedule: true,
};
