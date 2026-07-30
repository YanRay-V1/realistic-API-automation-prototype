package Public_API_Smoke_Flow.POJOs;

import com.fasterxml.jackson.annotation.JsonProperty;

public class BookingDates {
    @JsonProperty("checkin") private String checkin;
    @JsonProperty("checkout") private String checkout;

    public BookingDates() {}

    public BookingDates(String checkin, String checkout){
        this.checkin = checkin;
        this.checkout = checkout;
    }

    public void setCheckin(String checkin) {
        this.checkin = checkin;
    }

    public String getCheckin() {
        return checkin;
    }

    public void setCheckout(String checkout) {
        this.checkout = checkout;
    }

    public String getCheckout() {
        return checkout;
    }
}
