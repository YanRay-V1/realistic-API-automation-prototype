package Public_API_Smoke_Flow.Yaml;

import java.util.List;

public class YamlFlow {

    private String flowName;

    private List<String> stepNames;

    public List<String> getStepNames() {
        return stepNames;
    }

    public void setStepNames(List<String> stepNames) {
        this.stepNames = stepNames;
    }


    public String getFlowName() {
        return flowName;
    }

    public void setFlowName(String flowName) {
        this.flowName = flowName;
    }
}
