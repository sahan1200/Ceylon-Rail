import React, { useState, useEffect } from 'react';
import {
  MessageSquareWarning, Star, Send, CheckCircle2,
  Search, ShieldCheck, AlertCircle
} from 'lucide-react';
import { api } from '../services/api.js';

export default function ComplaintsPortal({ user, trains = [] }) {
  const [complaints, setComplaints] = useState([]);
  const [feedbackList, setFeedbackList] = useState([]);
  const [category, setCategory] = useState('PUNCTUALITY');
  const [priority, setPriority] = useState('MEDIUM');
  const [trainId, setTrainId] = useState('');
  const [bookingPnr, setBookingPnr] = useState('');
  const [guestName, setGuestName] = useState(user?.full_name || '');
  const [guestEmail, setGuestEmail] = useState(user?.email || '');
  const [guestPhone, setGuestPhone] = useState(user?.phone || '');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');

  // Guest Complaint Lookup state
  const [trackRef, setTrackRef] = useState('');
  const [trackVerification, setTrackVerification] = useState('');
  const [trackedComplaint, setTrackedComplaint] = useState(null);
  const [trackError, setTrackError] = useState('');

  // Rating Feedback state
  const [rating, setRating] = useState(5);
  const [feedbackName, setFeedbackName] = useState(user?.full_name || '');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    api.getFeedbackList().then((res) => setFeedbackList(res.feedback || [])).catch(() => {});
    if (user) {
      setGuestName(user.full_name || '');
      setGuestEmail(user.email || '');
      setGuestPhone(user.phone || '');
      setFeedbackName(user.full_name || '');
      api.getMyComplaints().then((res) => setComplaints(res.complaints || [])).catch(() => {});
    }
  }, [user]);

  const handleSubmitComplaint = async (e) => {
    e.preventDefault();
    setNotice('');
    setErrorMsg('');
    try {
      const res = await api.submitComplaint({
        category,
        priority,
        train_id: trainId ? Number(trainId) : null,
        booking_pnr: bookingPnr.trim() || null,
        guest_name: guestName.trim(),
        guest_email: guestEmail.trim(),
        guest_phone: guestPhone.trim(),
        subject,
        description
      });
      setComplaints([res.complaint, ...complaints]);
      setTrackedComplaint(res.complaint);
      setTrackRef(res.complaint.complaint_reference);
      setTrackVerification(guestEmail.trim() || guestPhone.trim() || bookingPnr.trim());
      setSubject('');
      setDescription('');
      setNotice(
        `Complaint submitted! Your Reference is ${res.complaint.complaint_reference}. Save this reference along with your contact email/phone to track status updates.`
      );
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleTrackComplaint = async (e) => {
    e.preventDefault();
    setTrackError('');
    try {
      const res = await api.trackComplaint(trackRef.trim(), trackVerification.trim());
      setTrackedComplaint(res.complaint);
    } catch (err) {
      setTrackedComplaint(null);
      setTrackError(err.message || 'Could not verify complaint with the provided reference and contact info.');
    }
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    setNotice('');
    setErrorMsg('');
    try {
      const res = await api.submitFeedback({
        train_id: trainId ? Number(trainId) : null,
        guest_name: feedbackName.trim() || 'Guest Passenger',
        overall_rating: Number(rating),
        comments: feedbackComment,
        is_public_testimonial: true
      });
      setFeedbackList([res.feedback, ...feedbackList]);
      setFeedbackComment('');
      setNotice('Thank you! Your railway service rating has been recorded.');
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 border border-slate-800">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">
          <MessageSquareWarning className="w-4 h-4" />
          <span>Passenger Redressal & Quality Assurance • No Login Required</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold">Passenger Complaint & Feedback Portal</h1>
        <p className="text-slate-300 text-sm mt-1">
          Submit official railway complaints without creating an account, track resolution status securely, or rate your journey experience.
        </p>
      </div>

      {notice && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Submit Complaint Form (Works for Guests & Logged-In Passengers) */}
        <form onSubmit={handleSubmitComplaint} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-bold text-lg text-slate-900">Submit Official Passenger Complaint</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Your Name *</label>
              <input
                type="text"
                required
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Full Name"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Email *</label>
              <input
                type="email"
                required
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
              <input
                type="text"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder="+94 77 123 4567"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              >
                <option value="PUNCTUALITY">Train Delays</option>
                <option value="CLEANLINESS">Cleanliness</option>
                <option value="SERVICE_QUALITY">Staff Service</option>
                <option value="TICKETING_REFUND">Ticketing & Reservations</option>
                <option value="PAYMENTS">Payments</option>
                <option value="SEAT_ALLOCATION">Seat Allocation</option>
                <option value="COACH_FACILITIES">Railway Facilities</option>
                <option value="OTHER">Other Railway Service Issues</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Related Booking PNR</label>
              <input
                type="text"
                value={bookingPnr}
                onChange={(e) => setBookingPnr(e.target.value)}
                placeholder="Optional (e.g. SLR-...)"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Related Train</label>
              <select
                value={trainId}
                onChange={(e) => setTrainId(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
              >
                <option value="">General / Station</option>
                {trains.map((t) => (
                  <option key={t.id} value={t.id}>#{t.train_number} {t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Subject *</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of the issue"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Detailed Description *</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide coach number, date, station, and details..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-[#FF6B4A] text-white text-sm font-semibold flex items-center gap-2 hover:opacity-95 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            Submit Complaint (No Account Required)
          </button>
        </form>

        {/* Track Complaint Securely & Submit Rating Feedback */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-2 text-indigo-700 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Secure Complaint Tracking</span>
            </div>
            <h2 className="font-bold text-lg text-slate-900">Track Complaint Status & Staff Responses</h2>
            <form onSubmit={handleTrackComplaint} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
              <div className="sm:col-span-5">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Complaint Reference *</label>
                <input
                  type="text"
                  required
                  value={trackRef}
                  onChange={(e) => setTrackRef(e.target.value)}
                  placeholder="CMP-..."
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono uppercase"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email, Phone, or PNR *</label>
                <input
                  type="text"
                  required
                  value={trackVerification}
                  onChange={(e) => setTrackVerification(e.target.value)}
                  placeholder="Verification contact"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full py-2 px-3 rounded-lg bg-indigo-900 text-white text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Search className="w-3.5 h-3.5" /> Track
                </button>
              </div>
            </form>

            {trackError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                {trackError}
              </div>
            )}

            {trackedComplaint && (
              <div className="p-4 rounded-xl bg-slate-50 border border-indigo-200 space-y-2.5 text-xs">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <span className="font-mono font-bold text-indigo-900">{trackedComplaint.complaint_reference}</span>
                  <span className="px-2.5 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-800">
                    {trackedComplaint.status}
                  </span>
                </div>
                <div className="font-bold text-slate-900 text-sm">{trackedComplaint.subject}</div>
                <p className="text-slate-600">{trackedComplaint.description}</p>
                {trackedComplaint.resolution_summary && (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                    <strong>Resolution:</strong> {trackedComplaint.resolution_summary}
                  </div>
                )}
                {trackedComplaint.status_history?.length > 0 && (
                  <div className="pt-2 border-t border-slate-200">
                    <div className="font-bold text-slate-700 mb-1">Status History:</div>
                    <div className="space-y-1">
                      {trackedComplaint.status_history.map((sh) => (
                        <div key={sh.id} className="text-[11px] text-slate-500">
                          • {sh.created_at}: <strong>{sh.new_status}</strong> ({sh.notes})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {trackedComplaint.responses?.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 space-y-1.5">
                    <div className="font-bold text-slate-700">Official Responses:</div>
                    {trackedComplaint.responses.map((r) => (
                      <div key={r.id} className="bg-white p-2 rounded border border-slate-200">
                        <span className="font-bold text-indigo-700">{r.author_name}: </span>
                        <span className="text-slate-700">{r.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmitFeedback} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <h2 className="font-bold text-lg text-slate-900">Rate Your Journey Experience</h2>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  type="button"
                  key={num}
                  onClick={() => setRating(num)}
                  className={`p-2 rounded-lg border ${
                    rating >= num ? 'bg-amber-50 border-amber-400 text-amber-500' : 'border-slate-200 text-slate-300'
                  }`}
                >
                  <Star className="w-5 h-5 fill-current" />
                </button>
              ))}
              <span className="text-sm font-bold text-slate-700 ml-2">{rating} / 5 Stars</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Comments & Suggestions</label>
              <textarea
                rows={2}
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                placeholder="Share your experience with punctuality, cleanliness, and staff..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
            >
              Submit Passenger Rating
            </button>
          </form>
        </div>
      </div>

      {/* Submitted Complaints in Current Session */}
      {complaints.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-bold text-lg text-slate-900">Submitted Complaints ({complaints.length})</h2>
          <div className="space-y-3">
            {complaints.map((c) => (
              <div key={c.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div className="font-bold text-sm text-slate-900">
                    [{c.complaint_reference}] {c.subject}
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                    {c.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{c.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
