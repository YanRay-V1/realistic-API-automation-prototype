package Public_API_Smoke_Flow.POJOs;

public class BookingPayload {
    private String firstname, lastname;
    private double totalprice;
    private boolean depositpaid;
    private BookingDates bookingdates;
    private String additionalneeds;

    public void setBookingdates(BookingDates bookingdates) {
        this.bookingdates = bookingdates;
    }

    public BookingDates getBookingdates() {
        return bookingdates;
    }

    public void setFirstname(String firstname) {
        this.firstname = firstname;
    }

    public String getFirstname() {
        return firstname;
    }

    public void setLastname(String lastname) {
        this.lastname = lastname;
    }

    public String getLastname() {
        return lastname;
    }

    public void setTotalprice(double totalprice) {
        this.totalprice = totalprice;
    }

    public double getTotalprice() {
        return totalprice;
    }

    public void setDepositpaid(boolean depositpaid) {
        this.depositpaid = depositpaid;
    }

    public boolean getDepositpaid() {
        return depositpaid;
    }


    public void setAdditionalneeds(String additionalneeds) {
        this.additionalneeds = additionalneeds;
    }

    public String getAdditionalneeds() {
        return additionalneeds;
    }
}

