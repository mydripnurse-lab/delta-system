/** Identification only. These fields never create contacts or send messages. */
export function appointmentCommunicationRoles(input: {
  clinicId?: unknown;
  clinicName?: unknown;
  platformFunded: boolean;
  balance: number;
}) {
  const clinicId = String(input.clinicId || '').trim();
  const isClinicAppointment = Boolean(clinicId);
  return {
    communicationRolesVersion: 1,
    professionalRecipientRole: isClinicAppointment ? 'clinic_nurse' : 'independent_partner',
    clinicId,
    clinicName: String(input.clinicName || '').trim(),
    clinicPortalUrl: isClinicAppointment
      ? 'https://partners.mydripnurse.com/portal/clinics'
      : '',
    collectionResponsibleRole: input.platformFunded
      ? 'my_drip_nurse'
      : isClinicAppointment ? 'clinic' : 'independent_partner',
    clinicBalanceAmount: isClinicAppointment && !input.platformFunded ? input.balance : 0,
    // A clinic's balance must never be mapped to a nurse's compensation field.
    nurseEarningsAmount: isClinicAppointment && !input.platformFunded ? null : input.balance,
    clinicCollectionStatus: isClinicAppointment && !input.platformFunded
      ? 'not_verified' : 'not_applicable',
  };
}
