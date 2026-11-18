from django import forms
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth.models import User
from .images import clean_image
from .models import Court, PlaySession


class CustomerAuthenticationForm(AuthenticationForm):
    def clean_username(self):
        return self.cleaned_data["username"].strip().lower()


class SignupForm(UserCreationForm):
    # Email is also the unique username, preventing duplicate customer identities.
    email = forms.EmailField(max_length=150)

    class Meta:
        model = User
        fields = ["email", "password1", "password2"]

    def clean_email(self):
        email = self.cleaned_data["email"].strip().lower()
        if User.objects.filter(username__iexact=email).exists() or User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("An account already uses this email.")
        return email

    def save(self, commit=True):
        self.instance.username = self.cleaned_data["email"]
        self.instance.email = self.cleaned_data["email"]
        return super().save(commit)


class ReceiptForm(forms.Form):
    proof = forms.FileField(help_text="PNG/JPEG only, up to 5 MB. Hide unrelated personal information.")
    reference = forms.CharField(max_length=120, label="Payment transaction reference")

    def clean_proof(self):
        return clean_image(self.cleaned_data["proof"])


class ReviewForm(forms.Form):
    decision = forms.ChoiceField(choices=[("confirm", "Confirm — transfer received"), ("reject", "Reject — transfer not verified")])
    bank_reference = forms.CharField(max_length=120, required=False, label="Reference checked in owner's payment account")
    note = forms.CharField(max_length=2000, widget=forms.Textarea)
    checked = forms.BooleanField(label="I checked the actual owner's account, amount, payee, and transaction reference.")


class ReservationForm(forms.Form):
    court_id = forms.ModelChoiceField(queryset=Court.objects.filter(active=True), label="Court / sport")
    session_id = forms.ModelChoiceField(queryset=PlaySession.objects.filter(active=True), required=False, label="Open Play (leave blank for court rental)")
    date = forms.DateField(required=False, widget=forms.DateInput(attrs={"type": "date"}))
    start_hour = forms.ChoiceField(required=False, choices=[(str(hour), f"{hour:02d}:00") for hour in range(8, 24)])
    hours = forms.IntegerField(required=False, min_value=1, max_value=16, initial=1)
    request_key = forms.UUIDField(widget=forms.HiddenInput)

    def clean(self):
        data = super().clean()
        if not data.get("session_id") and any(not data.get(field) for field in ["date", "start_hour", "hours"]):
            raise forms.ValidationError("Choose a date, start hour and duration for court rental.")
        return data
