package Public_API_Smoke_Flow.Yaml;


import java.util.Map;

public class YamlStep {
    private String name;
    private String action;
    private String payloadFile;
    private Integer expectedStatus;
    private Map<String,String> assertions;
    private Map<String,String> saveToContext;

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getPayloadFile() {
        return payloadFile;
    }

    public void setPayloadFile(String payloadFile) {
        this.payloadFile = payloadFile;
    }

    public Integer getExpectedStatus() {
        return expectedStatus;
    }

    public void setExpectedStatus(Integer expectedStatus) {
        this.expectedStatus = expectedStatus;
    }

    public Map<String, String> getAssertions() {
        return assertions;
    }

    public void setAssertions(Map<String, String> assertions) {
        this.assertions = assertions;
    }

    public Map<String, String> getSaveToContext() {
        return saveToContext;
    }

    public void setSaveToContext(Map<String, String> saveToContext) {
        this.saveToContext = saveToContext;
    }
}
